import type { PriceSummary, RealtimeQuote } from "../types";
import { changeColor, fmtPct, fmtPrice, fmtSigned, fmtVolumeLots, fmtLotsVolume } from "../format";
import InfoTip from "./InfoTip";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] text-[var(--color-muted)]">{label}</div>
      <div className="tabular-nums text-sm">{value}</div>
    </div>
  );
}

function MaTag({ label, value, price }: { label: string; value: number | null; price: number }) {
  // Price above the MA = bullish (red in TW convention); below = bearish (green).
  const color = value == null ? "text-[var(--color-muted)]" : changeColor(price - value);
  const bias = value == null ? null : ((price - value) / value) * 100;
  return (
    <div className="rounded bg-[var(--color-panel-2)] px-2 py-1">
      <div className="text-[11px] text-[var(--color-muted)]">{label}</div>
      <div className={`tabular-nums text-xs ${color}`}>{fmtPrice(value)}</div>
      <div className={`tabular-nums text-[10px] ${color}`}>
        {bias == null ? "" : `${bias > 0 ? "+" : ""}${bias.toFixed(1)}%`}
      </div>
    </div>
  );
}

export default function PriceHeader({ s, rt }: { s: PriceSummary; rt?: RealtimeQuote }) {
  const live = rt && rt.last_price > 0;
  const price = live ? rt!.last_price : s.close;
  const change = live ? rt!.last_price - s.ref_close : s.change;
  const changePct = live
    ? s.ref_close
      ? ((rt!.last_price - s.ref_close) / s.ref_close) * 100
      : 0
    : s.change_pct;
  // FinMind EOD volume is in shares; Fugle realtime total volume is in 張.
  const volumeText =
    live && rt!.total_volume > 0 ? fmtLotsVolume(rt!.total_volume) : fmtVolumeLots(s.volume);
  const color = changeColor(change);

  return (
    <div className="border-b border-[var(--color-border)] p-4">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <div>
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-semibold">{s.stock_name}</span>
            <span className="font-mono text-sm text-[var(--color-muted)]">{s.stock_id}</span>
            {s.is_etf ? (
              <span className="rounded bg-blue-600/25 px-1.5 py-0.5 text-[10px] text-blue-300">ETF</span>
            ) : (
              s.industry_category && (
                <span className="rounded bg-[var(--color-panel-2)] px-1.5 py-0.5 text-[10px] text-[var(--color-muted)]">
                  {s.industry_category}
                </span>
              )
            )}
            {live ? (
              <span className="rounded bg-[var(--color-up)]/20 px-1.5 py-0.5 text-[10px] text-[var(--color-up)]">
                ● 即時
              </span>
            ) : (
              <span className="rounded bg-[var(--color-panel-2)] px-1.5 py-0.5 text-[10px] text-[var(--color-muted)]">
                收盤
              </span>
            )}
          </div>
          <div className="mt-1 flex items-baseline gap-3">
            <span className={`text-3xl font-bold tabular-nums ${color}`}>{fmtPrice(price)}</span>
            <span className={`text-lg tabular-nums ${color}`}>
              {fmtSigned(change)} ({fmtPct(changePct)})
            </span>
          </div>
          <div className="mt-1 text-[11px] text-[var(--color-muted)]">
            {live ? "即時更新" : `收盤 ${s.date}`}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-x-6 gap-y-2 sm:grid-cols-4">
          <Stat label="開盤" value={fmtPrice(s.open)} />
          <Stat label="最高" value={fmtPrice(s.high)} />
          <Stat label="最低" value={fmtPrice(s.low)} />
          <Stat label="昨收" value={fmtPrice(s.prev_close)} />
          <div>
            <div className="text-[11px] text-[var(--color-muted)]">週漲幅</div>
            <div className={`tabular-nums text-sm ${changeColor(s.week_change_pct)}`}>
              {fmtPct(s.week_change_pct)}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-[var(--color-muted)]">月漲幅</div>
            <div className={`tabular-nums text-sm ${changeColor(s.month_change_pct)}`}>
              {fmtPct(s.month_change_pct)}
            </div>
          </div>
          <Stat label="成交量" value={volumeText} />
        </div>
      </div>

      <div className="mt-3 flex items-center gap-1 text-[11px] text-[var(--color-muted)]">
        均線位置（數字下方為乖離率）
        <InfoTip term="ma" />
        <InfoTip term="bias" />
      </div>
      <div className="mt-1 grid grid-cols-4 gap-2 sm:max-w-md">
        <MaTag label="MA5" value={s.ma5} price={price} />
        <MaTag label="MA20 (月)" value={s.ma20} price={price} />
        <MaTag label="MA60 (季)" value={s.ma60} price={price} />
        <MaTag label="MA200 (年)" value={s.ma200} price={price} />
      </div>
    </div>
  );
}
