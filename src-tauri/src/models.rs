use serde::{Deserialize, Serialize};

/// A searchable Taiwan-listed instrument (上市/上櫃).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SymbolInfo {
    pub stock_id: String,
    pub stock_name: String,
    pub industry_category: String,
    /// "twse" (上市) or "tpex" (上櫃) / other market type from FinMind.
    pub market_type: String,
}

/// Condition type for a price/indicator alert. Serializes to snake_case to match
/// the frontend (e.g. "price_above").
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AlertKind {
    PriceAbove,
    PriceBelow,
    PctAbove,
    PctBelow,
    RsiAbove,
    RsiBelow,
}

/// A user-defined alert rule, synced from the frontend to the backend engine.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AlertRule {
    pub id: String,
    pub stock_id: String,
    pub stock_name: String,
    pub kind: AlertKind,
    pub value: f64,
    pub enabled: bool,
}

/// One trading day OHLCV bar. `volume` is in shares.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Candle {
    pub date: String,
    pub open: f64,
    pub high: f64,
    pub low: f64,
    pub close: f64,
    pub volume: f64,
}

/// One intraday minute bar. `time` is epoch **seconds** (UTC).
#[derive(Debug, Clone, Serialize)]
pub struct IntradayCandle {
    pub time: i64,
    pub open: f64,
    pub high: f64,
    pub low: f64,
    pub close: f64,
    pub volume: f64,
}

/// A moving-average line aligned point-by-point to the candle series
/// (`None` for the leading days where the window is not yet full).
#[derive(Debug, Clone, Serialize)]
pub struct MaSeries {
    pub period: u32,
    pub values: Vec<Option<f64>>,
}

/// Net institutional flows for one day, in shares. Positive = net buy.
#[derive(Debug, Clone, Serialize)]
pub struct InstitutionalDay {
    pub date: String,
    pub foreign_net: f64,
    pub trust_net: f64,
    pub dealer_net: f64,
    pub total_net: f64,
}

/// Header summary shown for a single stock (latest EOD figures + changes + MAs).
#[derive(Debug, Clone, Serialize)]
pub struct PriceSummary {
    pub stock_id: String,
    pub stock_name: String,
    pub industry_category: String,
    pub is_etf: bool,
    pub date: String,
    pub open: f64,
    pub high: f64,
    pub low: f64,
    pub close: f64,
    pub prev_close: f64,
    /// Reference close for computing *today's* live change: the last completed
    /// session's close. Equals prev_close once today's EOD bar exists, otherwise
    /// equals the latest bar's close (today not yet posted by FinMind intraday).
    pub ref_close: f64,
    pub change: f64,
    pub change_pct: f64,
    pub week_change_pct: Option<f64>,
    pub month_change_pct: Option<f64>,
    pub volume: f64,
    pub ma5: Option<f64>,
    pub ma20: Option<f64>,
    pub ma60: Option<f64>,
    pub ma200: Option<f64>,
}

/// Technical-indicator bundle, each series aligned to the candle series.
#[derive(Debug, Clone, Serialize)]
pub struct Indicators {
    pub rsi14: Vec<Option<f64>>,
    pub k: Vec<Option<f64>>,
    pub d: Vec<Option<f64>>,
    pub macd_dif: Vec<Option<f64>>,
    pub macd_dea: Vec<Option<f64>>,
    pub macd_hist: Vec<Option<f64>>,
}

/// Latest valuation snapshot (本益比 / 股價淨值比 / 殖利率).
#[derive(Debug, Clone, Serialize)]
pub struct Valuation {
    pub date: String,
    pub per: f64,
    pub pbr: f64,
    pub dividend_yield: f64,
}

/// Daily margin trading balances, in 張 (lots). `*_change` is vs the prior day.
#[derive(Debug, Clone, Serialize)]
pub struct MarginDay {
    pub date: String,
    pub margin_balance: f64,
    pub margin_change: f64,
    pub short_balance: f64,
    pub short_change: f64,
}

/// Full payload for the single-stock focus view.
#[derive(Debug, Clone, Serialize)]
pub struct StockDetail {
    pub summary: PriceSummary,
    pub candles: Vec<Candle>,
    pub ma: Vec<MaSeries>,
    pub institutional: Vec<InstitutionalDay>,
    pub indicators: Indicators,
    pub valuation: Option<Valuation>,
    pub margin: Vec<MarginDay>,
}
