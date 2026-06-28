// Taiwan convention: red = up (漲), green = down (跌).

export function changeColor(v: number | null | undefined): string {
  if (v == null || v === 0) return "text-[var(--color-muted)]";
  return v > 0 ? "text-[var(--color-up)]" : "text-[var(--color-down)]";
}

export function fmtPrice(v: number | null | undefined, digits = 2): string {
  if (v == null) return "—";
  return v.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function fmtPct(v: number | null | undefined): string {
  if (v == null) return "—";
  const s = v.toFixed(2);
  return `${v > 0 ? "+" : ""}${s}%`;
}

export function fmtSigned(v: number | null | undefined, digits = 2): string {
  if (v == null) return "—";
  return `${v > 0 ? "+" : ""}${v.toFixed(digits)}`;
}

/** Shares → 張 (lots), 1 lot = 1000 shares. */
export function sharesToLots(shares: number): number {
  return Math.round(shares / 1000);
}

export function fmtLots(shares: number | null | undefined): string {
  if (shares == null) return "—";
  const lots = sharesToLots(shares);
  return `${lots > 0 ? "+" : ""}${lots.toLocaleString("en-US")}`;
}

/** Trading volume (shares) → 張, compact. */
export function fmtVolumeLots(shares: number | null | undefined): string {
  if (shares == null) return "—";
  const lots = sharesToLots(shares);
  if (lots >= 10000) return `${(lots / 10000).toFixed(1)} 萬張`;
  return `${lots.toLocaleString("en-US")} 張`;
}
