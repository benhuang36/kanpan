import { useState } from "react";
import { useStockDetail } from "../hooks";
import { useQuote } from "../realtime";
import { useStore, type WatchItem } from "../store";
import { changeColor, fmtPct, fmtPrice } from "../format";

function Row({
  item,
  index,
  dragOver,
  onDragStart,
  onDragEnter,
  onDrop,
  onDragEnd,
}: {
  item: WatchItem;
  index: number;
  dragOver: boolean;
  onDragStart: (i: number) => void;
  onDragEnter: (i: number) => void;
  onDrop: () => void;
  onDragEnd: () => void;
}) {
  const selected = useStore((s) => s.selected);
  const select = useStore((s) => s.select);
  const remove = useStore((s) => s.remove);
  const { data } = useStockDetail(item.stock_id);
  const rt = useQuote(item.stock_id);
  const sum = data?.summary;

  const live = rt && rt.last_price > 0;
  const price = live ? rt!.last_price : sum?.close;
  const changePct =
    live && sum?.ref_close
      ? ((rt!.last_price - sum.ref_close) / sum.ref_close) * 100
      : sum?.change_pct;

  const active = selected === item.stock_id;

  return (
    <div
      draggable
      onDragStart={() => onDragStart(index)}
      onDragEnter={() => onDragEnter(index)}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      onClick={() => select(item.stock_id)}
      className={`group flex cursor-pointer items-center justify-between border-l-2 px-2 py-2 ${
        dragOver ? "border-t border-t-blue-500" : ""
      } ${
        active
          ? "border-l-blue-500 bg-[var(--color-panel-2)]"
          : "border-l-transparent hover:bg-[var(--color-panel-2)]"
      }`}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <span
          className="cursor-grab text-[var(--color-muted)] opacity-0 group-hover:opacity-60"
          title="拖曳排序"
          aria-hidden="true"
        >
          ⠿
        </span>
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{item.stock_name}</div>
          <div className="font-mono text-xs text-[var(--color-muted)]">{item.stock_id}</div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="text-right">
          <div className={`text-sm tabular-nums ${changeColor(changePct)}`}>
            {price != null ? fmtPrice(price) : "—"}
          </div>
          <div className={`text-xs tabular-nums ${changeColor(changePct)}`}>
            {changePct != null ? fmtPct(changePct) : ""}
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
  const reorder = useStore((s) => s.reorder);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const handleDrop = () => {
    if (dragIndex != null && overIndex != null) {
      reorder(dragIndex, overIndex);
    }
    setDragIndex(null);
    setOverIndex(null);
  };

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
          watchlist.map((item, index) => (
            <Row
              key={item.stock_id}
              item={item}
              index={index}
              dragOver={overIndex === index && dragIndex !== index}
              onDragStart={setDragIndex}
              onDragEnter={setOverIndex}
              onDrop={handleDrop}
              onDragEnd={() => {
                setDragIndex(null);
                setOverIndex(null);
              }}
            />
          ))
        )}
      </div>
    </div>
  );
}
