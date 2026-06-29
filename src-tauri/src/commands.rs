use crate::cache;
use crate::error::{AppError, Result};
use crate::indicators::{apply_splits, build_indicators, build_ma, build_summary};
use crate::models::{StockDetail, SymbolInfo};
use crate::alerts::AlertState;
use crate::models::{AlertRule, IntradayCandle};
use crate::providers::finmind::FinMind;
use crate::providers::fugle::{FugleHttp, FugleManager};
use chrono::{Duration, Local};
use rusqlite::Connection;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::State;

/// Shared application state managed by Tauri.
pub struct AppState {
    pub db: Arc<Mutex<Connection>>,
    pub finmind: Arc<FinMind>,
    pub fugle: FugleManager,
    pub fugle_http: FugleHttp,
    pub alerts: Arc<AlertState>,
    /// When true (default), closing the window hides to tray instead of quitting.
    pub close_to_tray: AtomicBool,
}

const SYMBOLS_TTL_SECS: i64 = 7 * 24 * 3600;
const HISTORY_TTL_SECS: i64 = 3600;
const PRICE_LOOKBACK_DAYS: i64 = 400; // enough trading days for MA200
const INST_LOOKBACK_DAYS: i64 = 120;

fn now_unix() -> i64 {
    Local::now().timestamp()
}

fn fresh(conn: &Connection, key: &str, ttl: i64) -> bool {
    match cache::meta_get(conn, key) {
        Ok(Some(v)) => v.parse::<i64>().map(|ts| now_unix() - ts < ttl).unwrap_or(false),
        _ => false,
    }
}

/// Ensure the symbol list is cached and reasonably fresh.
async fn ensure_symbols(state: &AppState) -> Result<()> {
    let stale = {
        let conn = state.db.lock().unwrap();
        let empty = cache::symbols_count(&conn)? == 0;
        empty || !fresh(&conn, "symbols_updated", SYMBOLS_TTL_SECS)
    };
    if !stale {
        return Ok(());
    }
    match state.finmind.stock_info().await {
        Ok(symbols) if !symbols.is_empty() => {
            let mut conn = state.db.lock().unwrap();
            cache::upsert_symbols(&mut conn, &symbols)?;
            cache::meta_set(&conn, "symbols_updated", &now_unix().to_string())?;
            Ok(())
        }
        Ok(_) => Ok(()),
        Err(e) => {
            // Tolerate failure if we already have a cached list to search.
            let conn = state.db.lock().unwrap();
            if cache::symbols_count(&conn)? > 0 {
                Ok(())
            } else {
                Err(e)
            }
        }
    }
}

#[tauri::command]
pub async fn search_symbols(
    state: State<'_, AppState>,
    query: String,
) -> Result<Vec<SymbolInfo>> {
    if query.trim().is_empty() {
        return Ok(vec![]);
    }
    ensure_symbols(&state).await?;
    let conn = state.db.lock().unwrap();
    cache::search_symbols(&conn, &query, 30)
}

#[tauri::command]
pub async fn refresh_symbols(state: State<'_, AppState>) -> Result<usize> {
    let symbols = state.finmind.stock_info().await?;
    let mut conn = state.db.lock().unwrap();
    cache::upsert_symbols(&mut conn, &symbols)?;
    cache::meta_set(&conn, "symbols_updated", &now_unix().to_string())?;
    Ok(symbols.len())
}

#[tauri::command]
pub async fn get_stock_detail(
    state: State<'_, AppState>,
    stock_id: String,
) -> Result<StockDetail> {
    ensure_symbols(&state).await?;

    let today = Local::now().date_naive();
    let price_start = (today - Duration::days(PRICE_LOOKBACK_DAYS))
        .format("%Y-%m-%d")
        .to_string();
    let inst_start = (today - Duration::days(INST_LOOKBACK_DAYS))
        .format("%Y-%m-%d")
        .to_string();

    let info = {
        let conn = state.db.lock().unwrap();
        cache::get_symbol(&conn, &stock_id)?
    }
    .unwrap_or(SymbolInfo {
        stock_id: stock_id.clone(),
        stock_name: stock_id.clone(),
        industry_category: String::new(),
        market_type: String::new(),
    });

    // --- prices ---
    let price_key = format!("prices_fetched:{stock_id}");
    let need_prices = {
        let conn = state.db.lock().unwrap();
        cache::max_price_date(&conn, &stock_id)?.is_none() || !fresh(&conn, &price_key, HISTORY_TTL_SECS)
    };
    if need_prices {
        let fetch_start = {
            let conn = state.db.lock().unwrap();
            cache::max_price_date(&conn, &stock_id)?.unwrap_or_else(|| price_start.clone())
        };
        match state.finmind.daily_price(&stock_id, &fetch_start).await {
            Ok(candles) => {
                let mut conn = state.db.lock().unwrap();
                cache::upsert_prices(&mut conn, &stock_id, &candles)?;
                cache::meta_set(&conn, &price_key, &now_unix().to_string())?;
            }
            Err(e) => {
                let conn = state.db.lock().unwrap();
                if cache::max_price_date(&conn, &stock_id)?.is_none() {
                    return Err(e);
                }
                // else fall through to cached data
            }
        }
    }

    // --- institutional ---
    let inst_key = format!("inst_fetched:{stock_id}");
    let need_inst = {
        let conn = state.db.lock().unwrap();
        cache::max_inst_date(&conn, &stock_id)?.is_none() || !fresh(&conn, &inst_key, HISTORY_TTL_SECS)
    };
    if need_inst {
        let fetch_start = {
            let conn = state.db.lock().unwrap();
            cache::max_inst_date(&conn, &stock_id)?.unwrap_or_else(|| inst_start.clone())
        };
        if let Ok(days) = state.finmind.institutional(&stock_id, &fetch_start).await {
            let mut conn = state.db.lock().unwrap();
            cache::upsert_institutional(&mut conn, &stock_id, &days)?;
            cache::meta_set(&conn, &inst_key, &now_unix().to_string())?;
        }
    }

    // --- valuation (PER/PBR/殖利率) ---
    let per_key = format!("per_fetched:{stock_id}");
    let need_per = {
        let conn = state.db.lock().unwrap();
        cache::max_per_date(&conn, &stock_id)?.is_none() || !fresh(&conn, &per_key, HISTORY_TTL_SECS)
    };
    if need_per {
        let fetch_start = {
            let conn = state.db.lock().unwrap();
            cache::max_per_date(&conn, &stock_id)?.unwrap_or_else(|| inst_start.clone())
        };
        if let Ok(rows) = state.finmind.per_pbr(&stock_id, &fetch_start).await {
            let mut conn = state.db.lock().unwrap();
            cache::upsert_per(&mut conn, &stock_id, &rows)?;
            cache::meta_set(&conn, &per_key, &now_unix().to_string())?;
        }
    }

    // --- margin (融資融券) ---
    let margin_key = format!("margin_fetched:{stock_id}");
    let need_margin = {
        let conn = state.db.lock().unwrap();
        cache::max_margin_date(&conn, &stock_id)?.is_none()
            || !fresh(&conn, &margin_key, HISTORY_TTL_SECS)
    };
    if need_margin {
        let fetch_start = {
            let conn = state.db.lock().unwrap();
            cache::max_margin_date(&conn, &stock_id)?.unwrap_or_else(|| inst_start.clone())
        };
        if let Ok(rows) = state.finmind.margin(&stock_id, &fetch_start).await {
            let mut conn = state.db.lock().unwrap();
            cache::upsert_margin(&mut conn, &stock_id, &rows)?;
            cache::meta_set(&conn, &margin_key, &now_unix().to_string())?;
        }
    }

    // --- splits (for back-adjusting the chart/indicators) ---
    let split_key = format!("splits_fetched:{stock_id}");
    let need_splits = {
        let conn = state.db.lock().unwrap();
        !fresh(&conn, &split_key, HISTORY_TTL_SECS)
    };
    if need_splits {
        if let Ok(splits) = state.finmind.splits(&stock_id, &price_start).await {
            let mut conn = state.db.lock().unwrap();
            cache::upsert_splits(&mut conn, &stock_id, &splits)?;
            cache::meta_set(&conn, &split_key, &now_unix().to_string())?;
        }
    }

    // --- dividends (除權息, for back-adjusting the chart/indicators) ---
    let div_key = format!("div_fetched:{stock_id}");
    let need_div = {
        let conn = state.db.lock().unwrap();
        !fresh(&conn, &div_key, HISTORY_TTL_SECS)
    };
    if need_div {
        if let Ok(divs) = state.finmind.dividends(&stock_id, &price_start).await {
            let mut conn = state.db.lock().unwrap();
            cache::upsert_dividends(&mut conn, &stock_id, &divs)?;
            cache::meta_set(&conn, &div_key, &now_unix().to_string())?;
        }
    }

    let conn = state.db.lock().unwrap();
    let mut candles = cache::get_prices(&conn, &stock_id, &price_start)?;
    let mut adjustments = cache::get_splits(&conn, &stock_id, &price_start)?;
    adjustments.extend(cache::get_dividends(&conn, &stock_id, &price_start)?);
    let institutional = cache::get_institutional(&conn, &stock_id, &inst_start)?;
    let valuation = cache::latest_per(&conn, &stock_id)?;
    let margin = cache::get_margin(&conn, &stock_id, &inst_start)?;
    drop(conn);

    if candles.is_empty() {
        return Err(AppError::msg(format!("查無 {stock_id} 的歷史資料")));
    }
    // Back-adjust historical bars for splits + dividends so the series is continuous.
    apply_splits(&mut candles, &adjustments);
    let ma = build_ma(&candles);
    let indicators = build_indicators(&candles);
    let summary = build_summary(&info, &candles, &ma)
        .ok_or_else(|| AppError::msg("無法計算摘要"))?;

    Ok(StockDetail {
        summary,
        candles,
        ma,
        institutional,
        indicators,
        valuation,
        margin,
    })
}

#[tauri::command]
pub fn set_finmind_token(state: State<'_, AppState>, token: Option<String>) {
    state.finmind.set_token(token);
}

#[tauri::command]
pub fn finmind_token_set(state: State<'_, AppState>) -> bool {
    state.finmind.has_token()
}

#[tauri::command]
pub fn set_fugle_key(state: State<'_, AppState>, key: String) {
    state.fugle.set_key(key.clone());
    state.fugle_http.set_key(key);
}

#[tauri::command]
pub async fn get_intraday_candles(
    state: State<'_, AppState>,
    stock_id: String,
    timeframe: String,
) -> Result<Vec<IntradayCandle>> {
    state.fugle_http.intraday_candles(&stock_id, &timeframe).await
}

#[derive(serde::Deserialize)]
struct ChatResponse {
    choices: Vec<ChatChoice>,
}
#[derive(serde::Deserialize)]
struct ChatChoice {
    message: ChatMessage,
}
#[derive(serde::Deserialize)]
struct ChatMessage {
    content: String,
}

/// Relay a chat-completion request to a user-configured OpenAI-compatible
/// endpoint. The key/endpoint are supplied per call from the settings store.
#[tauri::command]
pub async fn ai_chat(
    endpoint: String,
    api_key: String,
    model: String,
    system: String,
    user: String,
    temperature: f64,
) -> Result<String> {
    let base = endpoint.trim().trim_end_matches('/');
    if base.is_empty() || api_key.is_empty() {
        return Err(AppError::msg("尚未設定 AI endpoint 或 API key"));
    }
    let url = format!("{base}/chat/completions");
    let body = serde_json::json!({
        "model": model,
        "messages": [
            { "role": "system", "content": system },
            { "role": "user", "content": user },
        ],
        "temperature": temperature,
        "stream": false,
    });

    let resp = reqwest::Client::new()
        .post(&url)
        .header("Authorization", format!("Bearer {api_key}"))
        .json(&body)
        .send()
        .await?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        let snippet: String = text.chars().take(300).collect();
        return Err(AppError::msg(format!("AI 請求失敗 {status}: {snippet}")));
    }

    let parsed: ChatResponse = resp.json().await?;
    parsed
        .choices
        .into_iter()
        .next()
        .map(|c| c.message.content)
        .ok_or_else(|| AppError::msg("AI 無回應內容"))
}

#[tauri::command]
pub fn fugle_key_set(state: State<'_, AppState>) -> bool {
    state.fugle.has_key()
}

#[tauri::command]
pub fn fugle_set_plan(state: State<'_, AppState>, focus: Option<String>, watch: Vec<String>) {
    state.fugle.set_plan(focus, watch);
}

#[tauri::command]
pub fn set_alerts(state: State<'_, AppState>, alerts: Vec<AlertRule>) {
    state.alerts.set_rules(alerts);
}

#[tauri::command]
pub fn set_poll_minutes(state: State<'_, AppState>, minutes: u64) {
    state.alerts.set_poll_minutes(minutes);
}

#[tauri::command]
pub fn set_close_to_tray(state: State<'_, AppState>, enabled: bool) {
    state.close_to_tray.store(enabled, Ordering::Relaxed);
}

// ---- connection tests (settings panel) ----

#[tauri::command]
pub async fn test_finmind(token: String) -> Result<String> {
    let fm = FinMind::new(if token.is_empty() { None } else { Some(token) });
    let start = (Local::now().date_naive() - Duration::days(7))
        .format("%Y-%m-%d")
        .to_string();
    fm.daily_price("2330", &start).await.map(|_| "連線成功".to_string())
}

#[tauri::command]
pub async fn test_fugle(key: String) -> Result<String> {
    let http = FugleHttp::new();
    http.set_key(key);
    http.intraday_candles("2330", "1")
        .await
        .map(|_| "連線成功".to_string())
}

#[tauri::command]
pub async fn test_ai(endpoint: String, api_key: String, model: String) -> Result<String> {
    ai_chat(endpoint, api_key, model, "You are a connection test.".into(), "ping".into(), 0.0)
        .await
        .map(|_| "連線成功".to_string())
}
