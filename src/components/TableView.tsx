import { useMemo, useState } from "react";
import { useStore } from "../store";
import { useWatchlistDetails } from "../hooks";
import { useRealtime } from "../realtime";
import { changeColor, fmtLots, fmtPct, fmtPrice } from "../format";

type Row = {
  stock_id: string;
  stock_name: string;
  price: number | null;
  changePct: number | null;
  weekPct: number | null;
  monthPct: number | null;
  rsi: number | null;
  biasMonth: number | null; // vs MA20
  biasYear: number | null; // vs MA200
  instNet: number | null;
};

type SortKey = keyof Omit<Row, "stock_id" | "stock_name">;

function lastNonNull(values: (number | null)[]): number | null {
  for (let i = values.length - 1; i >= 0; i--) if (values[i] != null) return values[i];
  return null;
}
const bias = (p: number | null, ma: number | null) =>
  p != null && ma ? ((p - ma) / ma) * 100 : null;

const COLS: { key: SortKey; label: string }[] = [
  { key: "price", label: "價格" },
  { key: "changePct", label: "漲跌%" },
  { key: "weekPct", label: "週%" },
  { key: "monthPct", label: "月%" },
  { key: "rsi", label: "RSI" },
  { key: "biasMonth", label: "距月線%" },
  { key: "biasYear", label: "距年線%" },
  { key: "instNet", label: "法人(張)" },
];

export default function TableView() {
  const watchlist = useStore((s) => s.watchlist);
  const select = useStore((s) => s.select);
  const setView = useStore((s) => s.setView);
  const results = useWatchlistDetails(watchlist);
  const quotes = useRealtime((s) => s.quotes);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "changePct", dir: -1 });

  const rows: Row[] = useMemo(() => {
    return results.map(({ item, detail }) => {
      const s = detail?.summary;
      const rt = quotes[item.stock_id];
      const live = rt && rt.last_price > 0;
      const price = live ? rt!.last_price : s?.close ?? null;
      const changePct =
        live && s?.prev_close
          ? ((rt!.last_price - s.prev_close) / s.prev_close) * 100
          : s?.change_pct ?? null;
      return {
        stock_id: item.stock_id,
        stock_name: item.stock_name,
        price,
        changePct,
        weekPct: s?.week_change_pct ?? null,
        monthPct: s?.month_change_pct ?? null,
        rsi: detail ? lastNonNull(detail.indicators.rsi14) : null,
        biasMonth: bias(price, s?.ma20 ?? null),
        biasYear: bias(price, s?.ma200 ?? null),
        instNet: detail?.institutional.at(-1)?.total_net ?? null,
      };
    });
  }, [results, quotes]);

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      const av = a[sort.key];
      const bv = b[sort.key];
      if (av == null) return 1;
      if (bv == null) return -1;
      return (av - bv) * sort.dir;
    });
  }, [rows, sort]);

  const onSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: -1 }));

  if (watchlist.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-[var(--color-muted)]">
        自選股是空的，先加入股票
      </div>
    );
  }

  const arrow = (key: SortKey) => (sort.key === key ? (sort.dir === 1 ? " ▲" : " ▼") : "");

  return (
    <div className="h-full overflow-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-[var(--color-panel)] text-xs text-[var(--color-muted)]">
          <tr>
            <th className="px-3 py-2 text-left">代號 / 名稱</th>
            {COLS.map((c) => (
              <th
                key={c.key}
                onClick={() => onSort(c.key)}
                className="cursor-pointer select-none px-3 py-2 text-right hover:text-white"
              >
                {c.label}
                {arrow(c.key)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr
              key={r.stock_id}
              onClick={() => {
                select(r.stock_id);
                setView("focus");
              }}
              className="cursor-pointer border-t border-[var(--color-border)] hover:bg-[var(--color-panel-2)]"
            >
              <td className="px-3 py-2">
                <span className="font-mono text-blue-400">{r.stock_id}</span>{" "}
                <span>{r.stock_name}</span>
              </td>
              <td className={`px-3 py-2 text-right tabular-nums ${changeColor(r.changePct)}`}>
                {r.price != null ? fmtPrice(r.price) : "—"}
              </td>
              <td className={`px-3 py-2 text-right tabular-nums ${changeColor(r.changePct)}`}>
                {fmtPct(r.changePct)}
              </td>
              <td className={`px-3 py-2 text-right tabular-nums ${changeColor(r.weekPct)}`}>
                {fmtPct(r.weekPct)}
              </td>
              <td className={`px-3 py-2 text-right tabular-nums ${changeColor(r.monthPct)}`}>
                {fmtPct(r.monthPct)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{r.rsi?.toFixed(0) ?? "—"}</td>
              <td className={`px-3 py-2 text-right tabular-nums ${changeColor(r.biasMonth)}`}>
                {r.biasMonth == null ? "—" : `${r.biasMonth > 0 ? "+" : ""}${r.biasMonth.toFixed(1)}%`}
              </td>
              <td className={`px-3 py-2 text-right tabular-nums ${changeColor(r.biasYear)}`}>
                {r.biasYear == null ? "—" : `${r.biasYear > 0 ? "+" : ""}${r.biasYear.toFixed(1)}%`}
              </td>
              <td className={`px-3 py-2 text-right tabular-nums ${changeColor(r.instNet)}`}>
                {r.instNet == null ? "—" : `${fmtLots(r.instNet)}`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
