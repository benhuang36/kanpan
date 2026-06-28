import type { AlertKind, AlertRule } from "./store";
import type { RealtimeQuote, StockDetail } from "./types";

export const ALERT_KIND_LABEL: Record<AlertKind, string> = {
  price_above: "價格 ≥",
  price_below: "價格 ≤",
  pct_above: "當日漲幅 ≥ (%)",
  pct_below: "當日跌幅 ≤ (%)",
  rsi_above: "RSI ≥",
  rsi_below: "RSI ≤",
};

function lastNonNull(values: (number | null)[]): number | null {
  for (let i = values.length - 1; i >= 0; i--) if (values[i] != null) return values[i];
  return null;
}

/** The current value of the metric a rule watches, or null if unavailable. */
export function ruleMetric(
  rule: AlertRule,
  detail: StockDetail | undefined,
  quote: RealtimeQuote | undefined,
): number | null {
  const s = detail?.summary;
  const live = quote && quote.last_price > 0;
  const price = live ? quote!.last_price : s?.close ?? null;
  switch (rule.kind) {
    case "price_above":
    case "price_below":
      return price;
    case "pct_above":
    case "pct_below":
      return live && s?.prev_close
        ? ((quote!.last_price - s.prev_close) / s.prev_close) * 100
        : s?.change_pct ?? null;
    case "rsi_above":
    case "rsi_below":
      return detail ? lastNonNull(detail.indicators.rsi14) : null;
  }
}

export function ruleMet(rule: AlertRule, metric: number | null): boolean {
  if (metric == null) return false;
  switch (rule.kind) {
    case "price_above":
    case "pct_above":
    case "rsi_above":
      return metric >= rule.value;
    case "price_below":
    case "pct_below":
    case "rsi_below":
      return metric <= rule.value;
  }
}

export function ruleSummary(rule: AlertRule): string {
  return `${rule.stock_name} ${ALERT_KIND_LABEL[rule.kind]} ${rule.value}`;
}
