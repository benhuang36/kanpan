import { useStockDetail } from "../hooks";
import { useQuote } from "../realtime";
import { useStore, type WatchItem } from "../store";
import { changeColor, fmtLots, fmtPct, fmtPrice } from "../format";

function MiniBias({ label, ma, price }: { label: string; ma: number | null; price: number }) {
  const bias = ma == null ? null : ((price - ma) / ma) * 100;
  return (
    <span className={`tabular-nums ${changeColor(bias)}`}>
      {label} {bias == null ? "—" : `${bias > 0 ? "+" : ""}${bias.toFixed(1)}%`}
    </span>
  );
}

export default function StockCard({ item }: { item: WatchItem }) {
  const { data } = useStockDetail(item.stock_id);
  const rt = useQuote(item.stock_id);
  const select = useStore((s) => s.select);
  const setView = useStore((s) => s.setView);
  const s = data?.summary;
  const latestInst = data?.institutional.at(-1);

  const live = rt && rt.last_price > 0;
  const price = live ? rt!.last_price : s?.close;
  const changePct =
    live && s?.prev_close
      ? ((rt!.last_price - s.prev_close) / s.prev_close) * 100
      : s?.change_pct;

  return (
    <button
      onClick={() => {
        select(item.stock_id);
        setView("focus");
      }}
      className="flex flex-col gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] p-3 text-left hover:border-blue-500"
    >
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium">{item.stock_name}</div>
          <div className="font-mono text-xs text-[var(--color-muted)]">{item.stock_id}</div>
        </div>
        <div className="text-right">
          <div className={`text-lg font-semibold tabular-nums ${changeColor(changePct)}`}>
            {price != null ? fmtPrice(price) : "—"}
            {live && <span className="ml-1 text-[10px] text-[var(--color-up)]">●</span>}
          </div>
          <div className={`text-xs tabular-nums ${changeColor(changePct)}`}>
            {changePct != null ? fmtPct(changePct) : ""}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
        <MiniBias label="月線" ma={s?.ma20 ?? null} price={price ?? 0} />
        <MiniBias label="季線" ma={s?.ma60 ?? null} price={price ?? 0} />
        <MiniBias label="年線" ma={s?.ma200 ?? null} price={price ?? 0} />
      </div>

      <div className="flex justify-between text-[11px] text-[var(--color-muted)]">
        <span>週 <span className={changeColor(s?.week_change_pct)}>{fmtPct(s?.week_change_pct)}</span></span>
        <span>月 <span className={changeColor(s?.month_change_pct)}>{fmtPct(s?.month_change_pct)}</span></span>
        <span>
          法人{" "}
          <span className={changeColor(latestInst?.total_net)}>
            {latestInst ? `${fmtLots(latestInst.total_net)}張` : "—"}
          </span>
        </span>
      </div>
    </button>
  );
}
