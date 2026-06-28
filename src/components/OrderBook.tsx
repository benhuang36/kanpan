import type { RealtimeQuote } from "../types";
import { fmtPrice, fmtVolumeLots } from "../format";
import InfoTip from "./InfoTip";

function Row({
  price,
  size,
  max,
  side,
}: {
  price: number;
  size: number;
  max: number;
  side: "bid" | "ask";
}) {
  const pct = max > 0 ? (size / max) * 100 : 0;
  // 委買 (bid) 紅、委賣 (ask) 綠 (TW convention)
  const barColor = side === "bid" ? "bg-[var(--color-up)]/25" : "bg-[var(--color-down)]/25";
  const priceColor = side === "bid" ? "text-[var(--color-up)]" : "text-[var(--color-down)]";
  return (
    <div className="relative flex items-center justify-between px-2 py-0.5 text-xs tabular-nums">
      <div
        className={`absolute inset-y-0 ${side === "bid" ? "left-0" : "right-0"} ${barColor}`}
        style={{ width: `${pct}%` }}
      />
      <span className={`relative ${priceColor}`}>{fmtPrice(price)}</span>
      <span className="relative text-[var(--color-muted)]">{Math.round(size / 1000)}</span>
    </div>
  );
}

export default function OrderBook({ quote }: { quote: RealtimeQuote | undefined }) {
  if (!quote || (quote.bids.length === 0 && quote.asks.length === 0)) {
    return (
      <div className="p-3 text-xs text-[var(--color-muted)]">
        無即時五檔（需 Fugle 金鑰且於盤中 09:00–13:30）
      </div>
    );
  }

  const asks = [...quote.asks].slice(0, 5).reverse(); // 高→低，賣壓在上
  const bids = quote.bids.slice(0, 5);
  const max = Math.max(
    ...asks.map((l) => l.size),
    ...bids.map((l) => l.size),
    1,
  );

  const inner = quote.bid_volume; // 內盤 (主動賣)
  const outer = quote.ask_volume; // 外盤 (主動買)
  const tot = inner + outer;
  const outerPct = tot > 0 ? (outer / tot) * 100 : 50;

  return (
    <div className="p-2">
      <div className="mb-1 flex items-center justify-between px-1 text-[11px] text-[var(--color-muted)]">
        <span>委買</span>
        <span>五檔</span>
        <span>委賣</span>
      </div>
      <div className="flex flex-col">
        {asks.map((l, i) => (
          <Row key={`a${i}`} price={l.price} size={l.size} max={max} side="ask" />
        ))}
        <div className="my-1 border-t border-[var(--color-border)]" />
        {bids.map((l, i) => (
          <Row key={`b${i}`} price={l.price} size={l.size} max={max} side="bid" />
        ))}
      </div>

      <div className="mt-3 px-1">
        <div className="mb-1 flex items-center justify-between text-[11px]">
          <span className="text-[var(--color-up)]">
            外盤 {fmtVolumeLots(outer)}
            <InfoTip term="order_book" />
          </span>
          <span className="text-[var(--color-down)]">內盤 {fmtVolumeLots(inner)}</span>
        </div>
        <div className="flex h-2 overflow-hidden rounded-full bg-[var(--color-down)]/30">
          <div className="bg-[var(--color-up)]" style={{ width: `${outerPct}%` }} />
        </div>
        <div className="mt-1 text-center text-[11px] text-[var(--color-muted)]">
          外盤佔比 {outerPct.toFixed(0)}%
        </div>
      </div>
    </div>
  );
}
