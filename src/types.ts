// Mirrors the serde structs in src-tauri/src/models.rs (snake_case fields).

export interface SymbolInfo {
  stock_id: string;
  stock_name: string;
  industry_category: string;
  market_type: string;
}

export interface Candle {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MaSeries {
  period: number;
  values: (number | null)[];
}

export interface IntradayCandle {
  time: number; // epoch seconds (UTC)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface ClosePoint {
  date: string;
  close: number;
}

export interface InstitutionalDay {
  date: string;
  foreign_net: number;
  trust_net: number;
  dealer_net: number;
  total_net: number;
}

export interface PriceSummary {
  stock_id: string;
  stock_name: string;
  industry_category: string;
  is_etf: boolean;
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  prev_close: number;
  ref_close: number;
  change: number;
  change_pct: number;
  week_change_pct: number | null;
  month_change_pct: number | null;
  volume: number;
  ma5: number | null;
  ma20: number | null;
  ma60: number | null;
  ma200: number | null;
}

export interface Indicators {
  rsi14: (number | null)[];
  k: (number | null)[];
  d: (number | null)[];
  macd_dif: (number | null)[];
  macd_dea: (number | null)[];
  macd_hist: (number | null)[];
}

export interface Valuation {
  date: string;
  per: number;
  pbr: number;
  dividend_yield: number;
}

export interface MarginDay {
  date: string;
  margin_balance: number;
  margin_change: number;
  short_balance: number;
  short_change: number;
}

export interface StockDetail {
  summary: PriceSummary;
  candles: Candle[];
  ma: MaSeries[];
  institutional: InstitutionalDay[];
  indicators: Indicators;
  valuation: Valuation | null;
  margin: MarginDay[];
}

export interface BookLevel {
  price: number;
  size: number;
}

export interface RealtimeQuote {
  stock_id: string;
  last_price: number;
  total_volume: number;
  ask_volume: number;
  bid_volume: number;
  bids: BookLevel[];
  asks: BookLevel[];
  at: number;
}
