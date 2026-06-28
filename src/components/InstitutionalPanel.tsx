import type { InstitutionalDay } from "../types";
import { changeColor, fmtLots } from "../format";
import InfoTip from "./InfoTip";

function NetCell({ label, shares, term }: { label: string; shares: number; term?: string }) {
  return (
    <div className="rounded bg-[var(--color-panel-2)] px-3 py-2">
      <div className="text-[11px] text-[var(--color-muted)]">
        {label}
        {term && <InfoTip term={term} />}
      </div>
      <div className={`tabular-nums text-sm ${changeColor(shares)}`}>{fmtLots(shares)} 張</div>
    </div>
  );
}

export default function InstitutionalPanel({ data }: { data: InstitutionalDay[] }) {
  if (data.length === 0) {
    return (
      <div className="p-4 text-xs text-[var(--color-muted)]">無三大法人資料</div>
    );
  }
  const latest = data[data.length - 1];
  const recent = data.slice(-20);
  const maxAbs = Math.max(...recent.map((d) => Math.abs(d.total_net)), 1);

  return (
    <div className="p-4">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
        三大法人買賣超 · {latest.date}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <NetCell label="外資" term="foreign" shares={latest.foreign_net} />
        <NetCell label="投信" term="trust" shares={latest.trust_net} />
        <NetCell label="自營商" term="dealer" shares={latest.dealer_net} />
        <NetCell label="合計" term="inst_total" shares={latest.total_net} />
      </div>

      <div className="mt-4 text-[11px] text-[var(--color-muted)]">近 20 日合計買賣超</div>
      <div className="mt-1 flex h-24 items-center gap-[2px]">
        {recent.map((d) => {
          const h = (Math.abs(d.total_net) / maxAbs) * 100;
          const up = d.total_net >= 0;
          return (
            <div
              key={d.date}
              title={`${d.date}  ${fmtLots(d.total_net)} 張`}
              className="flex flex-1 flex-col justify-center"
              style={{ height: "100%" }}
            >
              <div className="flex h-1/2 items-end">
                {up && (
                  <div
                    className="w-full rounded-t-sm bg-[var(--color-up)]"
                    style={{ height: `${h}%` }}
                  />
                )}
              </div>
              <div className="flex h-1/2 items-start">
                {!up && (
                  <div
                    className="w-full rounded-b-sm bg-[var(--color-down)]"
                    style={{ height: `${h}%` }}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
