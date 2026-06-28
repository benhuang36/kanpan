import { useStockDetail } from "../hooks";
import { useStore, type WatchItem } from "../store";
import { changeColor, fmtPct, fmtPrice } from "../format";

function Row({ item }: { item: WatchItem }) {
  const selected = useStore((s) => s.selected);
  const select = useStore((s) => s.select);
  const remove = useStore((s) => s.remove);
  const { data } = useStockDetail(item.stock_id);
  const sum = data?.summary;

  const active = selected === item.stock_id;

  return (
    <div
      onClick={() => select(item.stock_id)}
      className={`group flex cursor-pointer items-center justify-between border-l-2 px-3 py-2 ${
        active
          ? "border-blue-500 bg-[var(--color-panel-2)]"
          : "border-transparent hover:bg-[var(--color-panel-2)]"
      }`}
    >
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{item.stock_name}</div>
        <div className="font-mono text-xs text-[var(--color-muted)]">{item.stock_id}</div>
      </div>
      <div className="flex items-center gap-2">
        <div className="text-right">
          <div className={`text-sm tabular-nums ${changeColor(sum?.change_pct)}`}>
            {sum ? fmtPrice(sum.close) : "—"}
          </div>
          <div className={`text-xs tabular-nums ${changeColor(sum?.change_pct)}`}>
            {sum ? fmtPct(sum.change_pct) : ""}
          </div>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            remove(item.stock_id);
          }}
          className="hidden text-[var(--color-muted)] hover:text-[var(--color-up)] group-hover:block"
          title="移除"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

export default function Watchlist() {
  const watchlist = useStore((s) => s.watchlist);

  return (
    <div className="flex h-full flex-col">
      <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
        自選股 ({watchlist.length})
      </div>
      <div className="flex-1 overflow-auto">
        {watchlist.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-[var(--color-muted)]">
            用上方搜尋框加入股票
          </div>
        ) : (
          watchlist.map((item) => <Row key={item.stock_id} item={item} />)
        )}
      </div>
    </div>
  );
}
