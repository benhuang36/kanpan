import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  createChart,
  ColorType,
  CrosshairMode,
  type IChartApi,
  type UTCTimestamp,
  type Time,
} from "lightweight-charts";
import { getCloseHistory, getIntradayCandles } from "../api";
import { useStore } from "../store";
import { chartColors } from "../theme";
import { fmtPrice } from "../format";
import type { Candle } from "../types";

const TPE_OFFSET = 8 * 3600;

export type TrendRange = "today" | "week" | "month" | "year" | "5y" | "10y";

interface Point {
  time: Time;
  value: number;
  label: string;
}

function tpeLabel(epochSec: number): string {
  const d = new Date((epochSec + TPE_OFFSET) * 1000);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

export default function TrendChart({
  stockId,
  dailyCandles,
  range,
}: {
  stockId: string;
  dailyCandles: Candle[];
  range: TrendRange;
}) {
  const theme = useStore((s) => s.theme);
  const colorUp = useStore((s) => s.colorUp);
  const fugleKey = useStore((s) => s.fugleKey);
  const containerRef = useRef<HTMLDivElement>(null);
  const [legend, setLegend] = useState<{ label: string; value: number } | null>(null);
  const [side, setSide] = useState<"left" | "right">("left");

  const intraday = useQuery({
    queryKey: ["intraday", stockId, "1"],
    queryFn: () => getIntradayCandles(stockId, "1"),
    enabled: range === "today" && !!fugleKey,
    refetchInterval: range === "today" ? 30_000 : false,
  });
  const long = useQuery({
    queryKey: ["closehist", stockId, range],
    queryFn: () => getCloseHistory(stockId, range === "5y" ? 1825 : 3650),
    enabled: range === "5y" || range === "10y",
  });

  const points: Point[] = useMemo(() => {
    if (range === "today") {
      return (intraday.data ?? []).map((c) => ({
        time: (c.time + TPE_OFFSET) as UTCTimestamp,
        value: c.close,
        label: tpeLabel(c.time),
      }));
    }
    if (range === "5y" || range === "10y") {
      return (long.data ?? []).map((p) => ({ time: p.date as Time, value: p.close, label: p.date }));
    }
    const n = range === "week" ? 5 : range === "month" ? 22 : 250;
    return dailyCandles.slice(-n).map((c) => ({ time: c.date as Time, value: c.close, label: c.date }));
  }, [range, intraday.data, long.data, dailyCandles]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || points.length === 0) return;
    const col = chartColors(theme, colorUp);
    const up = points[points.length - 1].value >= points[0].value;
    const lineColor = up ? col.up : col.down;

    const chart: IChartApi = createChart(el, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: col.text,
        fontFamily: "inherit",
      },
      grid: { vertLines: { color: col.grid }, horzLines: { color: col.grid } },
      crosshair: { mode: CrosshairMode.Magnet },
      rightPriceScale: { borderColor: col.border },
      timeScale: {
        borderColor: col.border,
        timeVisible: range === "today",
        secondsVisible: false,
        fixLeftEdge: true,
        fixRightEdge: true,
      },
      autoSize: true,
    });
    const series = chart.addAreaSeries({
      lineColor,
      topColor: lineColor + "33",
      bottomColor: lineColor + "08",
      lineWidth: 2,
      priceLineVisible: false,
    });
    series.setData(points.map((p) => ({ time: p.time, value: p.value })));
    chart.timeScale().fitContent();

    const labelByTime = new Map(points.map((p, i) => [i, p]));
    chart.subscribeCrosshairMove((param) => {
      if (!param.point || param.logical == null) {
        setLegend(null);
        return;
      }
      const p = labelByTime.get(Math.round(param.logical as number));
      if (p) setLegend({ label: p.label, value: p.value });
      setSide((param.point.x as number) < 200 ? "right" : "left");
    });

    return () => chart.remove();
  }, [points, theme, colorUp, range]);

  if (range === "today" && !fugleKey) {
    return <Center>需 Fugle 金鑰才能看當日走勢</Center>;
  }
  if (range === "today" && intraday.isLoading) return <Center>載入中…</Center>;
  if ((range === "5y" || range === "10y") && long.isLoading) return <Center>載入長期資料…</Center>;
  if (points.length === 0) return <Center>無資料</Center>;

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      {legend && (
        <div
          className={`pointer-events-none absolute top-2 z-10 rounded bg-[var(--color-panel)]/85 px-2 py-1 text-[11px] leading-tight tabular-nums ${
            side === "left" ? "left-2" : "right-2"
          }`}
        >
          <span className="text-[var(--color-muted)]">{legend.label}</span>{" "}
          <span>{fmtPrice(legend.value)}</span>
        </div>
      )}
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center text-sm text-[var(--color-muted)]">
      {children}
    </div>
  );
}
