import { useEffect, useRef } from "react";
import {
  createChart,
  ColorType,
  CrosshairMode,
  type IChartApi,
  type UTCTimestamp,
} from "lightweight-charts";
import type { IntradayCandle } from "../types";

// Taipei is UTC+8; lightweight-charts renders UTC timestamps, so we shift the
// epoch by 8h to make the axis read as local wall-clock time.
const TPE_OFFSET = 8 * 3600;

export default function IntradayChart({ candles }: { candles: IntradayCandle[] }) {
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
      grid: { vertLines: { color: "#1b2130" }, horzLines: { color: "#1b2130" } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: "#232a3a" },
      timeScale: {
        borderColor: "#232a3a",
        timeVisible: true,
        secondsVisible: false,
        // Cap zoom-out so the data can't shrink below the full chart width.
        fixLeftEdge: true,
        fixRightEdge: true,
      },
      autoSize: true,
    });
    chartRef.current = chart;

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
        time: (c.time + TPE_OFFSET) as UTCTimestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      })),
    );

    const volumeSeries = chart.addHistogramSeries({
      priceScaleId: "vol",
      priceFormat: { type: "volume" },
    });
    volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });
    volumeSeries.setData(
      candles.map((c) => ({
        time: (c.time + TPE_OFFSET) as UTCTimestamp,
        value: c.volume,
        color: c.close >= c.open ? "rgba(226,59,59,0.4)" : "rgba(30,184,84,0.4)",
      })),
    );

    chart.timeScale().fitContent();
    return () => {
      chart.remove();
      chartRef.current = null;
    };
  }, [candles]);

  return <div ref={containerRef} className="h-full w-full" />;
}
