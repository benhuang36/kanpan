use crate::error::{AppError, Result};
use crate::models::{Candle, InstitutionalDay, MarginDay, SplitEvent, SymbolInfo, Valuation};
use serde_json::Value;
use std::collections::BTreeMap;
use std::sync::RwLock;

const BASE_URL: &str = "https://api.finmindtrade.com/api/v4/data";

/// FinMind open-data client. The token is optional (raises the hourly rate limit)
/// and can be updated at runtime from the settings UI.
pub struct FinMind {
    client: reqwest::Client,
    token: RwLock<Option<String>>,
}

impl FinMind {
    pub fn new(token: Option<String>) -> Self {
        FinMind {
            client: reqwest::Client::new(),
            token: RwLock::new(token.filter(|t| !t.is_empty())),
        }
    }

    pub fn set_token(&self, token: Option<String>) {
        *self.token.write().unwrap() = token.filter(|t| !t.is_empty());
    }

    pub fn has_token(&self) -> bool {
        self.token.read().unwrap().is_some()
    }

    async fn fetch(
        &self,
        dataset: &str,
        data_id: Option<&str>,
        start_date: Option<&str>,
    ) -> Result<Vec<Value>> {
        let mut query: Vec<(&str, String)> = vec![("dataset", dataset.to_string())];
        if let Some(id) = data_id {
            query.push(("data_id", id.to_string()));
        }
        if let Some(start) = start_date {
            query.push(("start_date", start.to_string()));
        }
        if let Some(tok) = self.token.read().unwrap().clone() {
            query.push(("token", tok));
        }

        let resp = self
            .client
            .get(BASE_URL)
            .query(&query)
            .send()
            .await
            .map_err(|_| AppError::msg("無法連線到 FinMind，請檢查網路連線後再試"))?;

        let http_status = resp.status().as_u16();
        // Parse the body even on non-2xx — FinMind returns a JSON message there.
        let body: Value = resp
            .json()
            .await
            .map_err(|_| AppError::msg("FinMind 回應格式異常，請稍後再試"))?;

        let api_status = body
            .get("status")
            .and_then(|s| s.as_i64())
            .unwrap_or(http_status as i64);
        if api_status != 200 {
            let raw = body.get("msg").and_then(|m| m.as_str()).unwrap_or("");
            return Err(AppError::msg(friendly_finmind_error(api_status, raw)));
        }

        match body.get("data") {
            Some(Value::Array(arr)) => Ok(arr.clone()),
            _ => Ok(vec![]),
        }
    }

    /// Full list of listed instruments, de-duplicated by stock id.
    pub async fn stock_info(&self) -> Result<Vec<SymbolInfo>> {
        let rows = self.fetch("TaiwanStockInfo", None, None).await?;
        let mut map: BTreeMap<String, SymbolInfo> = BTreeMap::new();
        for r in rows {
            let stock_id = str_field(&r, "stock_id");
            let stock_name = str_field(&r, "stock_name");
            if stock_id.is_empty() || stock_name.is_empty() {
                continue;
            }
            map.entry(stock_id.clone()).or_insert(SymbolInfo {
                stock_id,
                stock_name,
                industry_category: str_field(&r, "industry_category"),
                market_type: str_field(&r, "type"),
            });
        }
        Ok(map.into_values().collect())
    }

    /// Daily OHLCV bars from `start_date` (YYYY-MM-DD) to present.
    pub async fn daily_price(&self, stock_id: &str, start_date: &str) -> Result<Vec<Candle>> {
        let rows = self
            .fetch("TaiwanStockPrice", Some(stock_id), Some(start_date))
            .await?;
        let mut candles: Vec<Candle> = rows
            .iter()
            .map(|r| Candle {
                date: str_field(r, "date"),
                open: num_field(r, "open"),
                high: num_field(r, "max"),
                low: num_field(r, "min"),
                close: num_field(r, "close"),
                volume: num_field(r, "Trading_Volume"),
            })
            .filter(|c| !c.date.is_empty() && c.close > 0.0)
            .collect();
        candles.sort_by(|a, b| a.date.cmp(&b.date));
        Ok(candles)
    }

    /// Net institutional flows (shares) from `start_date`, grouped by day into
    /// foreign / investment-trust / dealer buckets.
    pub async fn institutional(
        &self,
        stock_id: &str,
        start_date: &str,
    ) -> Result<Vec<InstitutionalDay>> {
        let rows = self
            .fetch(
                "TaiwanStockInstitutionalInvestorsBuySell",
                Some(stock_id),
                Some(start_date),
            )
            .await?;

        // Aggregate the per-investor rows into one record per day.
        let mut by_date: BTreeMap<String, (f64, f64, f64)> = BTreeMap::new();
        for r in &rows {
            let date = str_field(r, "date");
            if date.is_empty() {
                continue;
            }
            let net = num_field(r, "buy") - num_field(r, "sell");
            let name = str_field(r, "name");
            let entry = by_date.entry(date).or_insert((0.0, 0.0, 0.0));
            match name.as_str() {
                "Foreign_Investor" | "Foreign_Dealer_Self" => entry.0 += net,
                "Investment_Trust" => entry.1 += net,
                "Dealer_self" | "Dealer_Hedging" | "Dealer" => entry.2 += net,
                _ => {}
            }
        }

        Ok(by_date
            .into_iter()
            .map(|(date, (foreign_net, trust_net, dealer_net))| InstitutionalDay {
                date,
                foreign_net,
                trust_net,
                dealer_net,
                total_net: foreign_net + trust_net + dealer_net,
            })
            .collect())
    }

    /// Stock-split events from `start_date`, ascending. factor = after / before.
    pub async fn splits(&self, stock_id: &str, start_date: &str) -> Result<Vec<SplitEvent>> {
        let rows = self
            .fetch("TaiwanStockSplitPrice", Some(stock_id), Some(start_date))
            .await?;
        let mut out: Vec<SplitEvent> = rows
            .iter()
            .filter_map(|r| {
                let date = str_field(r, "date");
                let before = num_field(r, "before_price");
                let after = num_field(r, "after_price");
                if date.is_empty() || before <= 0.0 || after <= 0.0 {
                    return None;
                }
                Some(SplitEvent {
                    date,
                    factor: after / before,
                })
            })
            .collect();
        out.sort_by(|a, b| a.date.cmp(&b.date));
        Ok(out)
    }

    /// Ex-dividend (除權息) events as multiplicative adjustment factors
    /// (after / before reference price), from `start_date`, ascending.
    pub async fn dividends(&self, stock_id: &str, start_date: &str) -> Result<Vec<SplitEvent>> {
        let rows = self
            .fetch("TaiwanStockDividendResult", Some(stock_id), Some(start_date))
            .await?;
        let mut out: Vec<SplitEvent> = rows
            .iter()
            .filter_map(|r| {
                let date = str_field(r, "date");
                let before = num_field(r, "before_price");
                let after = num_field(r, "after_price");
                if date.is_empty() || before <= 0.0 || after <= 0.0 {
                    return None;
                }
                Some(SplitEvent {
                    date,
                    factor: after / before,
                })
            })
            .collect();
        out.sort_by(|a, b| a.date.cmp(&b.date));
        Ok(out)
    }

    /// Valuation series (PER / PBR / 殖利率) from `start_date`, ascending.
    pub async fn per_pbr(&self, stock_id: &str, start_date: &str) -> Result<Vec<Valuation>> {
        let rows = self
            .fetch("TaiwanStockPER", Some(stock_id), Some(start_date))
            .await?;
        let mut out: Vec<Valuation> = rows
            .iter()
            .filter_map(|r| {
                let date = str_field(r, "date");
                if date.is_empty() {
                    return None;
                }
                Some(Valuation {
                    date,
                    per: num_field(r, "PER"),
                    pbr: num_field(r, "PBR"),
                    dividend_yield: num_field(r, "dividend_yield"),
                })
            })
            .collect();
        out.sort_by(|a, b| a.date.cmp(&b.date));
        Ok(out)
    }

    /// Daily margin balances (融資/融券, in 張) from `start_date`, ascending.
    pub async fn margin(&self, stock_id: &str, start_date: &str) -> Result<Vec<MarginDay>> {
        let rows = self
            .fetch(
                "TaiwanStockMarginPurchaseShortSale",
                Some(stock_id),
                Some(start_date),
            )
            .await?;
        let mut out: Vec<MarginDay> = rows
            .iter()
            .filter_map(|r| {
                let date = str_field(r, "date");
                if date.is_empty() {
                    return None;
                }
                let margin_balance = num_field(r, "MarginPurchaseTodayBalance");
                let margin_prev = num_field(r, "MarginPurchaseYesterdayBalance");
                let short_balance = num_field(r, "ShortSaleTodayBalance");
                let short_prev = num_field(r, "ShortSaleYesterdayBalance");
                Some(MarginDay {
                    date,
                    margin_balance,
                    margin_change: margin_balance - margin_prev,
                    short_balance,
                    short_change: short_balance - short_prev,
                })
            })
            .collect();
        out.sort_by(|a, b| a.date.cmp(&b.date));
        Ok(out)
    }
}

/// Map FinMind's status/message to a friendly, non-leaking Chinese message.
fn friendly_finmind_error(status: i64, raw: &str) -> String {
    let lower = raw.to_lowercase();
    if lower.contains("token") || lower.contains("illegal") {
        "FinMind token 無效，請到「設定」確認 FinMind token 是否正確（留空也可使用免費額度）".into()
    } else if status == 402 || lower.contains("limit") || lower.contains("upper") {
        "FinMind 已達免費請求上限，請稍後再試，或於「設定」填入 FinMind token 提高額度".into()
    } else {
        "FinMind 資料載入失敗，請稍後再試".into()
    }
}

fn str_field(v: &Value, key: &str) -> String {
    v.get(key).and_then(|x| x.as_str()).unwrap_or("").to_string()
}

fn num_field(v: &Value, key: &str) -> f64 {
    v.get(key).and_then(|x| x.as_f64()).unwrap_or(0.0)
}
