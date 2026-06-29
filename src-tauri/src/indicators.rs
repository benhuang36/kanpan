use crate::models::{Candle, Indicators, MaSeries, PriceSummary, SymbolInfo};
use chrono::Local;

/// Standard MA periods displayed across the app.
pub const MA_PERIODS: [u32; 4] = [5, 20, 60, 200];

/// Simple moving average over `closes`, returning a value aligned to each
/// input index (`None` until the window is full).
pub fn sma(closes: &[f64], period: usize) -> Vec<Option<f64>> {
    let mut out = Vec::with_capacity(closes.len());
    let mut sum = 0.0;
    for i in 0..closes.len() {
        sum += closes[i];
        if i >= period {
            sum -= closes[i - period];
        }
        if i + 1 >= period {
            out.push(Some(sum / period as f64));
        } else {
            out.push(None);
        }
    }
    out
}

/// Build the MA lines for the standard periods from an ascending candle series.
pub fn build_ma(candles: &[Candle]) -> Vec<MaSeries> {
    let closes: Vec<f64> = candles.iter().map(|c| c.close).collect();
    MA_PERIODS
        .iter()
        .map(|&p| MaSeries {
            period: p,
            values: sma(&closes, p as usize),
        })
        .collect()
}

fn pct_change(latest: f64, base: f64) -> Option<f64> {
    if base.abs() < f64::EPSILON {
        None
    } else {
        Some((latest - base) / base * 100.0)
    }
}

/// Build the header summary from an ascending candle series (oldest first).
/// `ma` must be the output of [`build_ma`] for the same candles.
pub fn build_summary(info: &SymbolInfo, candles: &[Candle], ma: &[MaSeries]) -> Option<PriceSummary> {
    let n = candles.len();
    if n == 0 {
        return None;
    }
    let last = &candles[n - 1];
    let prev_close = if n >= 2 { candles[n - 2].close } else { last.open };
    // Reference for today's live change: if the latest bar is today, use the
    // prior session; otherwise the latest bar IS the prior session (today's EOD
    // bar isn't posted yet during market hours).
    let today = Local::now().date_naive().format("%Y-%m-%d").to_string();
    let ref_close = if last.date == today { prev_close } else { last.close };
    // ~5 trading days ago for a week, ~20 for a month.
    let week_base = candles.get(n.saturating_sub(6)).map(|c| c.close);
    let month_base = candles.get(n.saturating_sub(21)).map(|c| c.close);

    let last_ma = |period: u32| -> Option<f64> {
        ma.iter()
            .find(|m| m.period == period)
            .and_then(|m| m.values.last().copied().flatten())
    };

    Some(PriceSummary {
        stock_id: info.stock_id.clone(),
        stock_name: info.stock_name.clone(),
        industry_category: info.industry_category.clone(),
        is_etf: info.industry_category == "ETF",
        date: last.date.clone(),
        open: last.open,
        high: last.high,
        low: last.low,
        close: last.close,
        prev_close,
        ref_close,
        change: last.close - prev_close,
        change_pct: pct_change(last.close, prev_close).unwrap_or(0.0),
        week_change_pct: week_base.and_then(|b| pct_change(last.close, b)),
        month_change_pct: month_base.and_then(|b| pct_change(last.close, b)),
        volume: last.volume,
        ma5: last_ma(5),
        ma20: last_ma(20),
        ma60: last_ma(60),
        ma200: last_ma(200),
    })
}

/// Wilder's RSI over `closes`. `None` until the first full window.
pub fn rsi(closes: &[f64], period: usize) -> Vec<Option<f64>> {
    let n = closes.len();
    let mut out = vec![None; n];
    if n <= period || period == 0 {
        return out;
    }
    let p = period as f64;
    let (mut gain, mut loss) = (0.0, 0.0);
    for i in 1..=period {
        let ch = closes[i] - closes[i - 1];
        if ch >= 0.0 {
            gain += ch;
        } else {
            loss -= ch;
        }
    }
    let (mut avg_gain, mut avg_loss) = (gain / p, loss / p);
    let rsi_val = |g: f64, l: f64| if l == 0.0 { 100.0 } else { 100.0 - 100.0 / (1.0 + g / l) };
    out[period] = Some(rsi_val(avg_gain, avg_loss));
    for i in period + 1..n {
        let ch = closes[i] - closes[i - 1];
        let (g, l) = if ch >= 0.0 { (ch, 0.0) } else { (0.0, -ch) };
        avg_gain = (avg_gain * (p - 1.0) + g) / p;
        avg_loss = (avg_loss * (p - 1.0) + l) / p;
        out[i] = Some(rsi_val(avg_gain, avg_loss));
    }
    out
}

/// Taiwan-style stochastic KD (9,3,3): K = 2/3·prevK + 1/3·RSV, D = 2/3·prevD + 1/3·K,
/// seeded at 50.
pub fn kd(
    highs: &[f64],
    lows: &[f64],
    closes: &[f64],
    n: usize,
) -> (Vec<Option<f64>>, Vec<Option<f64>>) {
    let len = closes.len();
    let mut k = vec![None; len];
    let mut d = vec![None; len];
    if n == 0 {
        return (k, d);
    }
    let (mut prev_k, mut prev_d) = (50.0, 50.0);
    for i in 0..len {
        if i + 1 < n {
            continue;
        }
        let window = i + 1 - n;
        let lo = lows[window..=i].iter().cloned().fold(f64::INFINITY, f64::min);
        let hi = highs[window..=i].iter().cloned().fold(f64::NEG_INFINITY, f64::max);
        let rsv = if (hi - lo).abs() < f64::EPSILON {
            0.0
        } else {
            (closes[i] - lo) / (hi - lo) * 100.0
        };
        let cur_k = prev_k * 2.0 / 3.0 + rsv / 3.0;
        let cur_d = prev_d * 2.0 / 3.0 + cur_k / 3.0;
        k[i] = Some(cur_k);
        d[i] = Some(cur_d);
        prev_k = cur_k;
        prev_d = cur_d;
    }
    (k, d)
}

/// Exponential moving average seeded from the first value.
fn ema(values: &[f64], period: usize) -> Vec<f64> {
    let mult = 2.0 / (period as f64 + 1.0);
    let mut out = Vec::with_capacity(values.len());
    let mut prev = 0.0;
    for (i, &v) in values.iter().enumerate() {
        prev = if i == 0 { v } else { (v - prev) * mult + prev };
        out.push(prev);
    }
    out
}

/// MACD (12,26,9): returns (DIF, DEA, histogram), each aligned to `closes`,
/// with leading values masked `None` until the slow/signal windows warm up.
pub fn macd(
    closes: &[f64],
    fast: usize,
    slow: usize,
    signal: usize,
) -> (Vec<Option<f64>>, Vec<Option<f64>>, Vec<Option<f64>>) {
    let len = closes.len();
    let ema_fast = ema(closes, fast);
    let ema_slow = ema(closes, slow);
    let dif_raw: Vec<f64> = (0..len).map(|i| ema_fast[i] - ema_slow[i]).collect();
    let dea_raw = ema(&dif_raw, signal);

    let mut dif = vec![None; len];
    let mut dea = vec![None; len];
    let mut hist = vec![None; len];
    for i in 0..len {
        if i + 1 >= slow {
            dif[i] = Some(dif_raw[i]);
        }
        if i + 1 >= slow + signal {
            dea[i] = Some(dea_raw[i]);
            hist[i] = Some(dif_raw[i] - dea_raw[i]);
        }
    }
    (dif, dea, hist)
}

/// Build the standard indicator bundle from an ascending candle series.
pub fn build_indicators(candles: &[Candle]) -> Indicators {
    let closes: Vec<f64> = candles.iter().map(|c| c.close).collect();
    let highs: Vec<f64> = candles.iter().map(|c| c.high).collect();
    let lows: Vec<f64> = candles.iter().map(|c| c.low).collect();
    let (k, d) = kd(&highs, &lows, &closes, 9);
    let (macd_dif, macd_dea, macd_hist) = macd(&closes, 12, 26, 9);
    Indicators {
        rsi14: rsi(&closes, 14),
        k,
        d,
        macd_dif,
        macd_dea,
        macd_hist,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sma_basic() {
        let closes = vec![1.0, 2.0, 3.0, 4.0, 5.0];
        let out = sma(&closes, 3);
        assert_eq!(out[0], None);
        assert_eq!(out[1], None);
        assert_eq!(out[2], Some(2.0));
        assert_eq!(out[3], Some(3.0));
        assert_eq!(out[4], Some(4.0));
    }
}
