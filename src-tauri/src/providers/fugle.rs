//! Fugle realtime market-data integration (Phase 3).
//!
//! A single WebSocket connection to
//! `wss://api.fugle.tw/marketdata/v1.0/stock/streaming` is multiplexed across all
//! subscribed symbols. We subscribe to the `trades` (成交) and `books` (最佳五檔)
//! channels; per-symbol state is accumulated and a merged [`RealtimeQuote`] is
//! emitted to the frontend as the `fugle://quote` event on every tick.

use crate::error::{AppError, Result};
use crate::models::IntradayCandle;
use chrono::DateTime;
use futures_util::{SinkExt, StreamExt};
use serde::Serialize;
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, RwLock};

/// Shared map of the latest realtime quote per symbol, readable by the alert engine.
pub type QuoteMap = Arc<Mutex<HashMap<String, RealtimeQuote>>>;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tokio::sync::mpsc::{unbounded_channel, UnboundedReceiver, UnboundedSender};
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::Message;

const WS_URL: &str = "wss://api.fugle.tw/marketdata/v1.0/stock/streaming";
const QUOTE_EVENT: &str = "fugle://quote";

/// One price level of the best-5 order book.
#[derive(Debug, Clone, Serialize)]
pub struct BookLevel {
    pub price: f64,
    pub size: f64,
}

/// Merged realtime snapshot for one symbol, emitted to the frontend.
#[derive(Debug, Clone, Serialize)]
pub struct RealtimeQuote {
    pub stock_id: String,
    pub last_price: f64,
    pub total_volume: f64,
    /// Cumulative volume hitting the ask (外盤, buyer-initiated).
    pub ask_volume: f64,
    /// Cumulative volume hitting the bid (內盤, seller-initiated).
    pub bid_volume: f64,
    pub bids: Vec<BookLevel>,
    pub asks: Vec<BookLevel>,
    /// Epoch millis of the latest tick.
    pub at: i64,
}

#[derive(Default)]
struct SymState {
    last_price: f64,
    total_volume: f64,
    bid_volume: f64,
    ask_volume: f64,
    bids: Vec<BookLevel>,
    asks: Vec<BookLevel>,
    at: i64,
}

impl SymState {
    fn to_quote(&self, stock_id: &str) -> RealtimeQuote {
        RealtimeQuote {
            stock_id: stock_id.to_string(),
            last_price: self.last_price,
            total_volume: self.total_volume,
            ask_volume: self.ask_volume,
            bid_volume: self.bid_volume,
            bids: self.bids.clone(),
            asks: self.asks.clone(),
            at: self.at,
        }
    }
}

const HTTP_BASE: &str = "https://api.fugle.tw/marketdata/v1.0/stock";

/// HTTP client for Fugle REST endpoints (intraday candles, etc.). Shares the same
/// API key as the realtime manager.
pub struct FugleHttp {
    client: reqwest::Client,
    key: RwLock<Option<String>>,
}

impl FugleHttp {
    pub fn new() -> Self {
        FugleHttp {
            client: reqwest::Client::new(),
            key: RwLock::new(None),
        }
    }

    pub fn set_key(&self, key: String) {
        *self.key.write().unwrap() = if key.is_empty() { None } else { Some(key) };
    }

    /// Today's intraday candles at the given timeframe ("1".."60" minutes).
    pub async fn intraday_candles(
        &self,
        symbol: &str,
        timeframe: &str,
    ) -> Result<Vec<IntradayCandle>> {
        let key = self
            .key
            .read()
            .unwrap()
            .clone()
            .ok_or_else(|| AppError::msg("尚未設定 Fugle 金鑰"))?;

        let url = format!("{HTTP_BASE}/intraday/candles/{symbol}");
        let resp = self
            .client
            .get(&url)
            .header("X-API-KEY", key)
            .query(&[("timeframe", timeframe)])
            .send()
            .await
            .map_err(|_| AppError::msg("無法連線到 Fugle，請檢查網路連線後再試"))?;

        let status = resp.status().as_u16();
        if !resp.status().is_success() {
            let msg = match status {
                401 | 403 => "Fugle API key 無效或無權限，請到「設定」確認 Fugle API key",
                429 => "Fugle 請求過於頻繁，請稍後再試",
                _ => "Fugle 分K 載入失敗，請稍後再試",
            };
            return Err(AppError::msg(msg));
        }
        let body: Value = resp
            .json()
            .await
            .map_err(|_| AppError::msg("Fugle 回應格式異常，請稍後再試"))?;
        let rows = match body.get("data").and_then(|d| d.as_array()) {
            Some(arr) => arr,
            None => return Ok(vec![]),
        };

        let mut out: Vec<IntradayCandle> = rows
            .iter()
            .filter_map(|r| {
                let ts = r.get("date").and_then(|d| d.as_str())?;
                let time = DateTime::parse_from_rfc3339(ts).ok()?.timestamp();
                Some(IntradayCandle {
                    time,
                    open: r.get("open").and_then(|x| x.as_f64()).unwrap_or(0.0),
                    high: r.get("high").and_then(|x| x.as_f64()).unwrap_or(0.0),
                    low: r.get("low").and_then(|x| x.as_f64()).unwrap_or(0.0),
                    close: r.get("close").and_then(|x| x.as_f64()).unwrap_or(0.0),
                    volume: r.get("volume").and_then(|x| x.as_f64()).unwrap_or(0.0),
                })
            })
            .collect();
        out.sort_by_key(|c| c.time);
        Ok(out)
    }
}

impl Default for FugleHttp {
    fn default() -> Self {
        Self::new()
    }
}

/// A market-data channel. Each (symbol, channel) pair counts as one Fugle
/// subscription (free tier allows only 5 total).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
enum Channel {
    Trades,
    Books,
}

impl Channel {
    fn name(self) -> &'static str {
        match self {
            Channel::Trades => "trades",
            Channel::Books => "books",
        }
    }
}

/// Free-tier subscription cap (5 subscriptions on 1 connection).
const MAX_SUBSCRIPTIONS: usize = 5;

enum Command {
    SetKey(String),
    /// The full desired set of (symbol, channel) subscriptions.
    SetTargets(Vec<(String, Channel)>),
}

/// Handle to the realtime connection task. Cheap to clone-free share via state.
pub struct FugleManager {
    tx: UnboundedSender<Command>,
    has_key: AtomicBool,
    latest: QuoteMap,
}

impl FugleManager {
    pub fn new(app: AppHandle) -> Self {
        let (tx, rx) = unbounded_channel();
        let latest: QuoteMap = Arc::new(Mutex::new(HashMap::new()));
        tauri::async_runtime::spawn(run(app, rx, latest.clone()));
        FugleManager {
            tx,
            has_key: AtomicBool::new(false),
            latest,
        }
    }

    /// Shared handle to the latest realtime quotes (for the alert engine).
    pub fn quotes(&self) -> QuoteMap {
        self.latest.clone()
    }

    pub fn set_key(&self, key: String) {
        if key.is_empty() {
            return;
        }
        self.has_key.store(true, Ordering::Relaxed);
        let _ = self.tx.send(Command::SetKey(key));
    }

    pub fn has_key(&self) -> bool {
        self.has_key.load(Ordering::Relaxed)
    }

    /// Plan subscriptions within the free-tier 5-subscription budget:
    /// the focused stock gets trades + books (price + best-5), and remaining
    /// watch-list stocks get trades (price) only until the budget is used up.
    pub fn set_plan(&self, focus: Option<String>, watch: Vec<String>) {
        let mut targets: Vec<(String, Channel)> = Vec::new();
        if let Some(f) = &focus {
            targets.push((f.clone(), Channel::Trades));
            targets.push((f.clone(), Channel::Books));
        }
        for id in watch {
            if targets.len() >= MAX_SUBSCRIPTIONS {
                break;
            }
            if Some(&id) == focus.as_ref() {
                continue;
            }
            targets.push((id, Channel::Trades));
        }
        let _ = self.tx.send(Command::SetTargets(targets));
    }
}

fn auth_msg(key: &str) -> Message {
    Message::Text(json!({ "event": "auth", "data": { "apikey": key } }).to_string().into())
}

fn sub_msg(symbol: &str, channel: Channel) -> Message {
    Message::Text(
        json!({ "event": "subscribe", "data": { "channel": channel.name(), "symbol": symbol } })
            .to_string()
            .into(),
    )
}

fn unsub_msg(symbol: &str, channel: Channel) -> Message {
    Message::Text(
        json!({ "event": "unsubscribe", "data": { "channel": channel.name(), "symbol": symbol } })
            .to_string()
            .into(),
    )
}

fn levels(v: &Value, key: &str) -> Vec<BookLevel> {
    v.get(key)
        .and_then(|a| a.as_array())
        .map(|arr| {
            arr.iter()
                .map(|l| BookLevel {
                    price: l.get("price").and_then(|x| x.as_f64()).unwrap_or(0.0),
                    size: l.get("size").and_then(|x| x.as_f64()).unwrap_or(0.0),
                })
                .collect()
        })
        .unwrap_or_default()
}

/// The connection task. Owns the socket, the set of desired symbols and the
/// per-symbol accumulators; reconnects with a fixed backoff.
async fn run(app: AppHandle, mut rx: UnboundedReceiver<Command>, latest: QuoteMap) {
    let mut key: Option<String> = None;
    let mut targets: HashSet<(String, Channel)> = HashSet::new();
    let mut state: HashMap<String, SymState> = HashMap::new();

    loop {
        // Without a key there is nothing to connect to: wait for commands.
        if key.is_none() {
            match rx.recv().await {
                None => return,
                Some(Command::SetKey(k)) => key = Some(k),
                Some(Command::SetTargets(t)) => {
                    targets = t.into_iter().collect();
                }
            }
            continue;
        }

        let ws = match connect_async(WS_URL).await {
            Ok((ws, _)) => ws,
            Err(_) => {
                tokio::time::sleep(Duration::from_secs(3)).await;
                continue;
            }
        };
        let (mut write, mut read) = ws.split();
        if write.send(auth_msg(key.as_ref().unwrap())).await.is_err() {
            tokio::time::sleep(Duration::from_secs(3)).await;
            continue;
        }
        let mut authed = false;

        // Inner loop: pump socket messages and control commands until the
        // connection drops or the key changes (which forces a reconnect).
        let reconnect = loop {
            tokio::select! {
                cmd = rx.recv() => match cmd {
                    None => return,
                    Some(Command::SetKey(k)) => { key = Some(k); break true; }
                    Some(Command::SetTargets(t)) => {
                        let new_set: HashSet<(String, Channel)> = t.into_iter().collect();
                        if authed {
                            for (sym, ch) in targets.difference(&new_set) {
                                eprintln!("[fugle] unsubscribe {sym} {}", ch.name());
                                let _ = write.send(unsub_msg(sym, *ch)).await;
                            }
                            for (sym, ch) in new_set.difference(&targets) {
                                eprintln!("[fugle] subscribe {sym} {}", ch.name());
                                let _ = write.send(sub_msg(sym, *ch)).await;
                            }
                        }
                        targets = new_set;
                    }
                },
                msg = read.next() => match msg {
                    None | Some(Err(_)) => break true,
                    Some(Ok(Message::Ping(p))) => { let _ = write.send(Message::Pong(p)).await; }
                    Some(Ok(Message::Text(txt))) => {
                        let parsed: Value = match serde_json::from_str(txt.as_str()) {
                            Ok(v) => v,
                            Err(_) => continue,
                        };
                        let event = parsed.get("event").and_then(|e| e.as_str()).unwrap_or("");
                        match event {
                            "authenticated" => {
                                authed = true;
                                for (sym, ch) in targets.iter() {
                                    let _ = write.send(sub_msg(sym, *ch)).await;
                                }
                            }
                            "data" => {
                                if let Some(quote) = apply_data(&parsed, &mut state) {
                                    if let Ok(mut map) = latest.lock() {
                                        map.insert(quote.stock_id.clone(), quote.clone());
                                    }
                                    let _ = app.emit(QUOTE_EVENT, &quote);
                                }
                            }
                            "subscribed" | "unsubscribed" | "error" => {
                                eprintln!("[fugle] {event}: {}", parsed.get("data").map(|d| d.to_string()).unwrap_or_default());
                            }
                            _ => {} // heartbeat
                        }
                    }
                    _ => {}
                },
            }
        };

        if reconnect {
            tokio::time::sleep(Duration::from_secs(2)).await;
        }
    }
}

/// Fold one `data` message into the per-symbol state and return the merged quote.
fn apply_data(parsed: &Value, state: &mut HashMap<String, SymState>) -> Option<RealtimeQuote> {
    let channel = parsed.get("channel").and_then(|c| c.as_str()).unwrap_or("");
    let data = parsed.get("data")?;
    let symbol = data.get("symbol").and_then(|s| s.as_str())?.to_string();
    let st = state.entry(symbol.clone()).or_default();
    let time_us = data.get("time").and_then(|t| t.as_i64()).unwrap_or(0);
    st.at = time_us / 1000;

    match channel {
        "trades" => {
            let price = data.get("price").and_then(|x| x.as_f64()).unwrap_or(0.0);
            let size = data.get("size").and_then(|x| x.as_f64()).unwrap_or(0.0);
            let bid = data.get("bid").and_then(|x| x.as_f64()).unwrap_or(0.0);
            let ask = data.get("ask").and_then(|x| x.as_f64()).unwrap_or(0.0);
            if price > 0.0 {
                st.last_price = price;
            }
            if let Some(vol) = data.get("volume").and_then(|x| x.as_f64()) {
                st.total_volume = vol;
            }
            // Classify the trade as 外盤 (hit the ask) or 內盤 (hit the bid).
            if ask > 0.0 && price >= ask {
                st.ask_volume += size;
            } else if bid > 0.0 && price <= bid {
                st.bid_volume += size;
            }
        }
        "books" => {
            st.bids = levels(data, "bids");
            st.asks = levels(data, "asks");
        }
        _ => return None,
    }

    Some(st.to_quote(&symbol))
}
