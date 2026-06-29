//! Backend alert engine.
//!
//! Runs on a tokio timer (independent of the webview, so it keeps working while
//! the window is hidden in the tray). Every ~20s it re-evaluates each enabled
//! rule against the latest realtime quote (from the Fugle WebSocket) or the
//! cached EOD data, and fires a desktop notification when a rule transitions
//! from unmet to met. EOD data for the watched symbols is refreshed on the
//! configured poll interval.

use crate::cache;
use crate::indicators::{apply_splits, rsi};
use crate::models::{AlertKind, AlertRule};
use crate::providers::finmind::FinMind;
use crate::providers::fugle::QuoteMap;
use chrono::{Duration as ChronoDuration, Local};
use rusqlite::Connection;
use std::collections::{HashMap, HashSet};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::AppHandle;
use tauri_plugin_notification::NotificationExt;

const EVAL_INTERVAL: Duration = Duration::from_secs(20);

/// Shared alert configuration, written by the `set_alerts` / `set_poll_minutes`
/// commands and read by the engine task.
pub struct AlertState {
    rules: Mutex<Vec<AlertRule>>,
    triggered: Mutex<HashMap<String, bool>>,
    poll_minutes: AtomicU64,
}

impl AlertState {
    pub fn new() -> Self {
        AlertState {
            rules: Mutex::new(Vec::new()),
            triggered: Mutex::new(HashMap::new()),
            poll_minutes: AtomicU64::new(5),
        }
    }

    pub fn set_rules(&self, rules: Vec<AlertRule>) {
        *self.rules.lock().unwrap() = rules;
    }

    pub fn set_poll_minutes(&self, minutes: u64) {
        self.poll_minutes.store(minutes, Ordering::Relaxed);
    }
}

impl Default for AlertState {
    fn default() -> Self {
        Self::new()
    }
}

fn lookback(days: i64) -> String {
    (Local::now().date_naive() - ChronoDuration::days(days))
        .format("%Y-%m-%d")
        .to_string()
}

/// Spawn the engine task. Cheap to call once at setup.
pub fn spawn_engine(
    app: AppHandle,
    db: Arc<Mutex<Connection>>,
    finmind: Arc<FinMind>,
    quotes: QuoteMap,
    state: Arc<AlertState>,
) {
    tauri::async_runtime::spawn(async move {
        let mut last_refresh = Instant::now() - Duration::from_secs(86_400);
        loop {
            let rules: Vec<AlertRule> = state
                .rules
                .lock()
                .unwrap()
                .iter()
                .filter(|r| r.enabled)
                .cloned()
                .collect();

            // Refresh EOD data for watched symbols on the poll interval.
            let poll = state.poll_minutes.load(Ordering::Relaxed);
            if poll > 0 && !rules.is_empty() && last_refresh.elapsed() >= Duration::from_secs(poll * 60)
            {
                let ids: HashSet<String> = rules.iter().map(|r| r.stock_id.clone()).collect();
                for id in ids {
                    refresh_eod(&db, &finmind, &id).await;
                }
                last_refresh = Instant::now();
            }

            // Evaluate rules; fire on unmet -> met transitions.
            for r in &rules {
                if let Some(metric) = metric_for(&db, &quotes, r) {
                    let met = rule_met(r, metric);
                    let was = state
                        .triggered
                        .lock()
                        .unwrap()
                        .get(&r.id)
                        .copied()
                        .unwrap_or(false);
                    if met && !was {
                        notify(&app, r, metric);
                    }
                    state.triggered.lock().unwrap().insert(r.id.clone(), met);
                }
            }

            tokio::time::sleep(EVAL_INTERVAL).await;
        }
    });
}

async fn refresh_eod(db: &Arc<Mutex<Connection>>, finmind: &FinMind, id: &str) {
    let start = {
        let conn = match db.lock() {
            Ok(c) => c,
            Err(_) => return,
        };
        cache::max_price_date(&conn, id).ok().flatten()
    }
    .unwrap_or_else(|| lookback(60));

    if let Ok(candles) = finmind.daily_price(id, &start).await {
        if let Ok(mut conn) = db.lock() {
            let _ = cache::upsert_prices(&mut conn, id, &candles);
        }
    }
}

fn metric_for(db: &Arc<Mutex<Connection>>, quotes: &QuoteMap, r: &AlertRule) -> Option<f64> {
    match r.kind {
        AlertKind::PriceAbove | AlertKind::PriceBelow => current_price(db, quotes, &r.stock_id),
        AlertKind::PctAbove | AlertKind::PctBelow => day_pct(db, quotes, &r.stock_id),
        AlertKind::RsiAbove | AlertKind::RsiBelow => last_rsi(db, &r.stock_id),
    }
}

fn live_price(quotes: &QuoteMap, id: &str) -> Option<f64> {
    quotes
        .lock()
        .ok()
        .and_then(|m| m.get(id).map(|q| q.last_price))
        .filter(|p| *p > 0.0)
}

fn current_price(db: &Arc<Mutex<Connection>>, quotes: &QuoteMap, id: &str) -> Option<f64> {
    if let Some(p) = live_price(quotes, id) {
        return Some(p);
    }
    let conn = db.lock().ok()?;
    let candles = cache::get_prices(&conn, id, &lookback(400)).ok()?;
    candles.last().map(|c| c.close)
}

fn day_pct(db: &Arc<Mutex<Connection>>, quotes: &QuoteMap, id: &str) -> Option<f64> {
    let candles = {
        let conn = db.lock().ok()?;
        cache::get_prices(&conn, id, &lookback(400)).ok()?
    };
    let n = candles.len();
    if n < 2 {
        return None;
    }
    let last = &candles[n - 1];
    let today = Local::now().date_naive().format("%Y-%m-%d").to_string();
    // Reference close for today's move (today's EOD bar may not be posted yet).
    let ref_close = if last.date == today {
        candles[n - 2].close
    } else {
        last.close
    };
    if ref_close == 0.0 {
        return None;
    }
    let price = live_price(quotes, id).unwrap_or(last.close);
    Some((price - ref_close) / ref_close * 100.0)
}

fn last_rsi(db: &Arc<Mutex<Connection>>, id: &str) -> Option<f64> {
    let (mut candles, adjustments) = {
        let conn = db.lock().ok()?;
        let candles = cache::get_prices(&conn, id, &lookback(400)).ok()?;
        let mut adj = cache::get_splits(&conn, id, &lookback(400)).ok()?;
        adj.extend(cache::get_dividends(&conn, id, &lookback(400)).ok()?);
        (candles, adj)
    };
    if candles.len() < 15 {
        return None;
    }
    apply_splits(&mut candles, &adjustments);
    let closes: Vec<f64> = candles.iter().map(|c| c.close).collect();
    rsi(&closes, 14).iter().rev().flatten().next().copied()
}

fn rule_met(r: &AlertRule, metric: f64) -> bool {
    match r.kind {
        AlertKind::PriceAbove | AlertKind::PctAbove | AlertKind::RsiAbove => metric >= r.value,
        AlertKind::PriceBelow | AlertKind::PctBelow | AlertKind::RsiBelow => metric <= r.value,
    }
}

fn kind_label(kind: AlertKind) -> &'static str {
    match kind {
        AlertKind::PriceAbove => "價格 ≥",
        AlertKind::PriceBelow => "價格 ≤",
        AlertKind::PctAbove => "當日漲幅 ≥ (%)",
        AlertKind::PctBelow => "當日跌幅 ≤ (%)",
        AlertKind::RsiAbove => "RSI ≥",
        AlertKind::RsiBelow => "RSI ≤",
    }
}

fn notify(app: &AppHandle, r: &AlertRule, metric: f64) {
    let title = format!("🔔 {} {}", r.stock_id, r.stock_name);
    let body = format!("{} {}（目前 {:.2}）", kind_label(r.kind), r.value, metric);
    let _ = app.notification().builder().title(title).body(body).show();
}
