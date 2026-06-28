import type { MarginDay, Valuation } from "../types";
import { changeColor } from "../format";
import InfoTip from "./InfoTip";

function Cell({
  label,
  value,
  sub,
  subTone,
  term,
}: {
  label: string;
  value: string;
  sub?: string;
  subTone?: string;
  term?: string;
}) {
  return (
    <div className="rounded bg-[var(--color-panel-2)] px-3 py-2">
      <div className="text-[11px] text-[var(--color-muted)]">
        {label}
        {term && <InfoTip term={term} />}
      </div>
      <div className="tabular-nums text-sm">{value}</div>
      {sub && <div className={`tabular-nums text-[11px] ${subTone ?? "text-[var(--color-muted)]"}`}>{sub}</div>}
    </div>
  );
}

function fmtLot(v: number): string {
  return Math.round(v).toLocaleString("en-US");
}
function fmtChange(v: number): string {
  return `${v > 0 ? "+" : ""}${fmtLot(v)}`;
}

export default function ValuationPanel({
  valuation,
  margin,
}: {
  valuation: Valuation | null;
  margin: MarginDay[];
}) {
  const m = margin.at(-1);
  // 券資比 = 融券餘額 / 融資餘額
  const ratio = m && m.margin_balance > 0 ? (m.short_balance / m.margin_balance) * 100 : null;

  return (
    <div className="p-3">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
        估值 {valuation ? `· ${valuation.date}` : ""}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Cell label="本益比 PER" term="per" value={valuation ? valuation.per.toFixed(2) : "—"} />
        <Cell label="股價淨值比 PBR" term="pbr" value={valuation ? valuation.pbr.toFixed(2) : "—"} />
        <Cell
          label="殖利率"
          term="dividend_yield"
          value={valuation ? `${valuation.dividend_yield.toFixed(2)}%` : "—"}
        />
      </div>

      <div className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
        融資融券 (張) {m ? `· ${m.date}` : ""}
      </div>
      {m ? (
        <div className="grid grid-cols-3 gap-2">
          <Cell
            label="融資餘額"
            term="margin"
            value={fmtLot(m.margin_balance)}
            sub={`日增減 ${fmtChange(m.margin_change)}`}
            subTone={changeColor(m.margin_change)}
          />
          <Cell
            label="融券餘額"
            term="short"
            value={fmtLot(m.short_balance)}
            sub={`日增減 ${fmtChange(m.short_change)}`}
            subTone={changeColor(m.short_change)}
          />
          <Cell
            label="券資比"
            term="short_margin_ratio"
            value={ratio == null ? "—" : `${ratio.toFixed(2)}%`}
          />
        </div>
      ) : (
        <div className="text-xs text-[var(--color-muted)]">無融資融券資料</div>
      )}
    </div>
  );
}
