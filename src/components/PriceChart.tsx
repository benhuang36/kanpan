import { useEffect, useRef } from "react";
import {
  createChart,
  ColorType,
  CrosshairMode,
  type IChartApi,
} from "lightweight-charts";
import type { Candle, MaSeries } from "../types";

const MA_COLORS: Record<number, string> = {
  5: "#f5d142",
  20: "#4ea1ff",
  60: "#c061ff",
  200: "#ff8c42",
};

export default function PriceChart({
  candles,
  ma,
}: {
  candles: Candle[];
  ma: MaSeries[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

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

    return () => {
      chart.remove();
      chartRef.current = null;
    };
  }, [candles, ma]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      <div className="pointer-events-none absolute left-2 top-2 flex gap-3 text-[11px]">
        {ma.map((m) => (
          <span key={m.period} style={{ color: MA_COLORS[m.period] }}>
            MA{m.period}
          </span>
        ))}
      </div>
    </div>
  );
}
