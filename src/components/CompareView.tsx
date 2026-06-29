import { useEffect, useRef, useState } from "react";
import { createChart, ColorType, type IChartApi } from "lightweight-charts";
import { useStore } from "../store";
import { useWatchlistDetails } from "../hooks";

const PALETTE = [
  "#4ea1ff", "#e23b3b", "#1eb854", "#f5d142", "#c061ff",
  "#ff8c42", "#42d4d4", "#ff6fb5", "#9acd32", "#b0a0ff",
];

const PERIODS = [
  { label: "1月", days: 20 },
  { label: "3月", days: 60 },
  { label: "6月", days: 120 },
  { label: "1年", days: 240 },
];

export default function CompareView() {
  const watchlist = useStore((s) => s.watchlist);
  const results = useWatchlistDetails(watchlist);
  const [days, setDays] = useState(60);
  const chartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!chartRef.current) return;
    const chart: IChartApi = createChart(chartRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#8b93a7",
        fontFamily: "inherit",
      },
      grid: { vertLines: { color: "#1b2130" }, horzLines: { color: "#1b2130" } },
      rightPriceScale: { borderColor: "#232a3a" },
      timeScale: {
        borderColor: "#232a3a",
        // Cap zoom-out so the data can't shrink below the full chart width.
        fixLeftEdge: true,
        fixRightEdge: true,
      },
      autoSize: true,
    });

    results.forEach((r, i) => {
      const candles = r.detail?.candles;
      if (!candles || candles.length === 0) return;
      const slice = candles.slice(-days);
      const base = slice[0].close;
      if (!base) return;
      const series = chart.addLineSeries({
        color: PALETTE[i % PALETTE.length],
        lineWidth: 2,
        lastValueVisible: true,
        priceLineVisible: false,
      });
      series.setData(
        slice.map((c) => ({ time: c.date, value: (c.close / base - 1) * 100 })),
      );
    });
    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [results, days]);

  if (watchlist.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-[var(--color-muted)]">
        自選股是空的，先加入幾檔再比較
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col p-3">
      <div className="mb-2 flex items-center gap-3">
        <span className="text-sm font-semibold">相對表現比較（標準化 %）</span>
        <div className="flex rounded-md border border-[var(--color-border)] p-0.5 text-xs">
          {PERIODS.map((p) => (
            <button
              key={p.days}
              onClick={() => setDays(p.days)}
              className={`rounded px-2 py-0.5 ${
                days === p.days ? "bg-blue-600" : "hover:bg-[var(--color-panel-2)]"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <div className="mb-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
        {watchlist.map((w, i) => (
          <span key={w.stock_id} style={{ color: PALETTE[i % PALETTE.length] }}>
            ● {w.stock_name} {w.stock_id}
          </span>
        ))}
      </div>
      <div ref={chartRef} className="min-h-0 flex-1" />
    </div>
  );
}
