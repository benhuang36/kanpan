import { useEffect, useRef, useState } from "react";
import {
  createChart,
  ColorType,
  CrosshairMode,
  type IChartApi,
} from "lightweight-charts";
import type { Candle, MaSeries } from "../types";
import { changeColor, fmtPct, fmtPrice, fmtSigned, fmtVolumeLots } from "../format";

const MA_COLORS: Record<number, string> = {
  5: "#f5d142",
  20: "#4ea1ff",
  60: "#c061ff",
  200: "#ff8c42",
};

interface Legend {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  prevClose: number;
  change: number;
  changePct: number;
  volume: number;
  mas: { period: number; value: number | null }[];
}

export default function PriceChart({
  candles,
  ma,
}: {
  candles: Candle[];
  ma: MaSeries[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [legend, setLegend] = useState<Legend | null>(null);
  // Flip the legend to the opposite side when the cursor is over it.
  const [side, setSide] = useState<"left" | "right">("left");

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const chart = createChart(el, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#8b93a7",
        fontFamily: "inherit",
      },
      grid: {
        vertLines: { color: "#1b2130" },
        horzLines: { color: "#1b2130" },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: "#232a3a" },
      timeScale: {
        borderColor: "#232a3a",
        rightOffset: 4,
        // Cap zoom-out so the data can't shrink below the full chart width.
        fixLeftEdge: true,
        fixRightEdge: true,
      },
      autoSize: true,
    });
    chartRef.current = chart;

    // 漲紅跌綠 (Taiwan convention)
    const candleSeries = chart.addCandlestickSeries({
      upColor: "#e23b3b",
      downColor: "#1eb854",
      borderUpColor: "#e23b3b",
      borderDownColor: "#1eb854",
      wickUpColor: "#e23b3b",
      wickDownColor: "#1eb854",
    });
    candleSeries.setData(
      candles.map((c) => ({
        time: c.date,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      })),
    );

    const volumeSeries = chart.addHistogramSeries({
      priceScaleId: "vol",
      priceFormat: { type: "volume" },
      color: "#2a3142",
    });
    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
    });
    volumeSeries.setData(
      candles.map((c) => ({
        time: c.date,
        value: c.volume,
        color: c.close >= c.open ? "rgba(226,59,59,0.4)" : "rgba(30,184,84,0.4)",
      })),
    );

    for (const series of ma) {
      const line = chart.addLineSeries({
        color: MA_COLORS[series.period] ?? "#888",
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      const data = series.values
        .map((v, i) => (v == null ? null : { time: candles[i].date, value: v }))
        .filter((p): p is { time: string; value: number } => p !== null);
      line.setData(data);
    }

    chart.timeScale().fitContent();

    // Build the hover legend for the candle at index `i`.
    const buildLegend = (i: number): Legend | null => {
      if (i < 0 || i >= candles.length) return null;
      const c = candles[i];
      const prevClose = i > 0 ? candles[i - 1].close : c.open;
      return {
        date: c.date,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        prevClose,
        change: c.close - prevClose,
        changePct: prevClose ? ((c.close - prevClose) / prevClose) * 100 : 0,
        volume: c.volume,
        mas: ma.map((m) => ({ period: m.period, value: m.values[i] ?? null })),
      };
    };

    // Default to the latest bar; update as the crosshair moves.
    setLegend(buildLegend(candles.length - 1));
    // Approx legend width; if the crosshair enters this left region, flip the
    // legend to the right so it doesn't cover the bars under the cursor.
    const LEGEND_ZONE = 280;
    chart.subscribeCrosshairMove((param) => {
      const i =
        param.logical != null ? Math.round(param.logical as number) : candles.length - 1;
      const next = buildLegend(i);
      if (next) setLegend(next);
      const x = param.point?.x;
      if (x != null) setSide(x < LEGEND_ZONE ? "right" : "left");
    });

    return () => {
      chart.remove();
      chartRef.current = null;
    };
  }, [candles, ma]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      {legend && (
        <div
          className={`pointer-events-none absolute top-2 z-10 rounded bg-[var(--color-panel)]/85 px-2 py-1 text-[11px] leading-tight ${
            side === "left" ? "left-2" : "right-2"
          }`}
        >
          <div className="text-[var(--color-muted)]">{legend.date}</div>
          <div className="mt-0.5 flex flex-wrap gap-x-2 tabular-nums">
            <span>
              <span className="text-[var(--color-muted)]">開</span>{" "}
              <span className={changeColor(legend.open - legend.prevClose)}>
                {fmtPrice(legend.open)}
              </span>
            </span>
            <span>
              <span className="text-[var(--color-muted)]">高</span>{" "}
              <span className={changeColor(legend.high - legend.prevClose)}>
                {fmtPrice(legend.high)}
              </span>
            </span>
            <span>
              <span className="text-[var(--color-muted)]">低</span>{" "}
              <span className={changeColor(legend.low - legend.prevClose)}>
                {fmtPrice(legend.low)}
              </span>
            </span>
            <span>
              <span className="text-[var(--color-muted)]">收</span>{" "}
              <span className={changeColor(legend.change)}>{fmtPrice(legend.close)}</span>
            </span>
          </div>
          <div className="mt-0.5 flex flex-wrap gap-x-2 tabular-nums">
            <span className={changeColor(legend.change)}>漲 {fmtSigned(legend.change)}</span>
            <span className={changeColor(legend.change)}>幅 {fmtPct(legend.changePct)}</span>
            <span className="text-[var(--color-muted)]">量 {fmtVolumeLots(legend.volume)}</span>
          </div>
          <div className="mt-0.5 flex flex-wrap gap-x-2 tabular-nums">
            {legend.mas.map((m) => (
              <span key={m.period} style={{ color: MA_COLORS[m.period] }}>
                MA{m.period} {m.value == null ? "—" : fmtPrice(m.value)}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
