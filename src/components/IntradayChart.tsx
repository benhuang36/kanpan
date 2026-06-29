import { useEffect, useRef, useState } from "react";
import {
  createChart,
  ColorType,
  CrosshairMode,
  type IChartApi,
  type UTCTimestamp,
} from "lightweight-charts";
import type { IntradayCandle } from "../types";
import { changeColor, fmtPct, fmtPrice, fmtSigned, fmtLotsVolume } from "../format";

// Taipei is UTC+8; lightweight-charts renders UTC timestamps, so we shift the
// epoch by 8h to make the axis read as local wall-clock time.
const TPE_OFFSET = 8 * 3600;

interface Legend {
  label: string;
  open: number;
  high: number;
  low: number;
  close: number;
  prevClose: number;
  change: number;
  changePct: number;
  volume: number;
}

function tpeLabel(epochSec: number): string {
  const d = new Date((epochSec + TPE_OFFSET) * 1000);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

export default function IntradayChart({ candles }: { candles: IntradayCandle[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [legend, setLegend] = useState<Legend | null>(null);
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

    const buildLegend = (i: number): Legend | null => {
      if (i < 0 || i >= candles.length) return null;
      const c = candles[i];
      const prevClose = i > 0 ? candles[i - 1].close : c.open;
      return {
        label: tpeLabel(c.time),
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        prevClose,
        change: c.close - prevClose,
        changePct: prevClose ? ((c.close - prevClose) / prevClose) * 100 : 0,
        volume: c.volume,
      };
    };

    setLegend(buildLegend(candles.length - 1));
    const LEGEND_ZONE = 260;
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
  }, [candles]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      {legend && (
        <div
          className={`pointer-events-none absolute top-2 z-10 rounded bg-[var(--color-panel)]/85 px-2 py-1 text-[11px] leading-tight ${
            side === "left" ? "left-2" : "right-2"
          }`}
        >
          <div className="text-[var(--color-muted)]">{legend.label}</div>
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
            <span className="text-[var(--color-muted)]">量 {fmtLotsVolume(legend.volume)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
