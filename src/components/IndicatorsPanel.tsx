import { useEffect, useRef } from "react";
import { createChart, ColorType, type IChartApi } from "lightweight-charts";
import type { Candle, Indicators } from "../types";
import InfoTip from "./InfoTip";

type Pt = { time: string; value: number };

function alignLine(dates: string[], values: (number | null)[]): Pt[] {
  return values
    .map((v, i) => (v == null ? null : { time: dates[i], value: v }))
    .filter((p): p is Pt => p !== null);
}

function lastNonNull(values: (number | null)[]): number | null {
  for (let i = values.length - 1; i >= 0; i--) {
    if (values[i] != null) return values[i];
  }
  return null;
}

function Badge({ text, tone }: { text: string; tone: "up" | "down" | "muted" }) {
  const cls =
    tone === "up"
      ? "bg-[var(--color-up)]/20 text-[var(--color-up)]"
      : tone === "down"
        ? "bg-[var(--color-down)]/20 text-[var(--color-down)]"
        : "bg-[var(--color-panel-2)] text-[var(--color-muted)]";
  return <span className={`rounded px-1.5 py-0.5 text-[10px] ${cls}`}>{text}</span>;
}

export default function IndicatorsPanel({
  candles,
  ind,
}: {
  candles: Candle[];
  ind: Indicators;
}) {
  const rsiRef = useRef<HTMLDivElement>(null);
  const macdRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const dates = candles.map((c) => c.date);
    const tail = (arr: (number | null)[]) => arr.slice(-90);
    const tailDates = dates.slice(-90);

    const base = {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#8b93a7",
        fontFamily: "inherit",
        fontSize: 10,
      },
      grid: { vertLines: { color: "#1b2130" }, horzLines: { color: "#1b2130" } },
      rightPriceScale: { borderColor: "#232a3a" },
      timeScale: { borderColor: "#232a3a" },
      autoSize: true,
    };

    const charts: IChartApi[] = [];

    if (rsiRef.current) {
      const c = createChart(rsiRef.current, base);
      const line = c.addLineSeries({ color: "#4ea1ff", lineWidth: 2, lastValueVisible: true });
      line.setData(alignLine(tailDates, tail(ind.rsi14)));
      line.createPriceLine({ price: 70, color: "#e23b3b", lineWidth: 1, lineStyle: 2, axisLabelVisible: false, title: "" });
      line.createPriceLine({ price: 30, color: "#1eb854", lineWidth: 1, lineStyle: 2, axisLabelVisible: false, title: "" });
      c.timeScale().fitContent();
      charts.push(c);
    }

    if (macdRef.current) {
      const c = createChart(macdRef.current, base);
      const hist = c.addHistogramSeries({ priceLineVisible: false });
      hist.setData(
        alignLine(tailDates, tail(ind.macd_hist)).map((p) => ({
          time: p.time,
          value: p.value,
          color: p.value >= 0 ? "rgba(226,59,59,0.6)" : "rgba(30,184,84,0.6)",
        })),
      );
      const dif = c.addLineSeries({ color: "#f5d142", lineWidth: 1, lastValueVisible: false, priceLineVisible: false });
      dif.setData(alignLine(tailDates, tail(ind.macd_dif)));
      const dea = c.addLineSeries({ color: "#c061ff", lineWidth: 1, lastValueVisible: false, priceLineVisible: false });
      dea.setData(alignLine(tailDates, tail(ind.macd_dea)));
      c.timeScale().fitContent();
      charts.push(c);
    }

    return () => charts.forEach((c) => c.remove());
  }, [candles, ind]);

  // --- interpretation ---
  const rsi = lastNonNull(ind.rsi14);
  const k = lastNonNull(ind.k);
  const d = lastNonNull(ind.d);
  const hist = lastNonNull(ind.macd_hist);

  const rsiTone = rsi == null ? "muted" : rsi >= 70 ? "up" : rsi <= 30 ? "down" : "muted";
  const rsiText = rsi == null ? "—" : rsi >= 70 ? "過熱" : rsi <= 30 ? "超賣" : "中性";

  let kdText = "—";
  let kdTone: "up" | "down" | "muted" = "muted";
  if (k != null && d != null) {
    kdTone = k >= d ? "up" : "down";
    kdText = k >= d ? "K>D 偏多" : "K<D 偏空";
  }

  const macdTone = hist == null ? "muted" : hist >= 0 ? "up" : "down";
  const macdText = hist == null ? "—" : hist >= 0 ? "柱翻紅 偏多" : "柱翻綠 偏空";

  return (
    <div className="p-3">
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <span>
          RSI(14)
          <InfoTip term="rsi" /> <b className="tabular-nums">{rsi?.toFixed(1) ?? "—"}</b>{" "}
          <Badge text={rsiText} tone={rsiTone} />
        </span>
        <span>
          KD
          <InfoTip term="kd" /> <b className="tabular-nums">{k?.toFixed(1) ?? "—"}</b>/
          <b className="tabular-nums">{d?.toFixed(1) ?? "—"}</b> <Badge text={kdText} tone={kdTone} />
        </span>
        <span>
          MACD 柱
          <InfoTip term="macd" /> <b className="tabular-nums">{hist?.toFixed(2) ?? "—"}</b>{" "}
          <Badge text={macdText} tone={macdTone} />
        </span>
      </div>
      <div className="text-[11px] text-[var(--color-muted)]">RSI（70/30 為過熱/超賣）</div>
      <div ref={rsiRef} className="h-28 w-full" />
      <div className="mt-2 text-[11px] text-[var(--color-muted)]">MACD（DIF 黃 / DEA 紫 / 柱）</div>
      <div ref={macdRef} className="h-28 w-full" />
    </div>
  );
}
