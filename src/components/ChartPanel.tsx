import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getIntradayCandles } from "../api";
import { useStore } from "../store";
import PriceChart from "./PriceChart";
import IntradayChart from "./IntradayChart";
import TrendChart, { type TrendRange } from "./TrendChart";
import type { Candle, MaSeries } from "../types";

type TF = "D" | "1" | "5" | "15" | "60";

const TFS: { id: TF; label: string }[] = [
  { id: "D", label: "日K" },
  { id: "1", label: "1分" },
  { id: "5", label: "5分" },
  { id: "15", label: "15分" },
  { id: "60", label: "60分" },
];

const RANGES: { id: TrendRange; label: string }[] = [
  { id: "today", label: "當天" },
  { id: "week", label: "當週" },
  { id: "month", label: "當月" },
  { id: "year", label: "當年" },
  { id: "5y", label: "5年" },
  { id: "10y", label: "10年" },
];

export default function ChartPanel({
  stockId,
  candles,
  ma,
}: {
  stockId: string;
  candles: Candle[];
  ma: MaSeries[];
}) {
  const [mode, setMode] = useState<"kline" | "trend">("kline");
  const [tf, setTf] = useState<TF>(useStore.getState().defaultTimeframe);
  const [range, setRange] = useState<TrendRange>("year");
  const fugleKey = useStore((s) => s.fugleKey);
  const intraday = tf !== "D";

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["intraday", stockId, tf],
    queryFn: () => getIntradayCandles(stockId, tf),
    enabled: mode === "kline" && intraday && !!fugleKey,
    refetchInterval: intraday ? 30_000 : false, // 盤中自動更新
  });

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 px-2 py-1">
        <div className="flex rounded-md border border-[var(--color-border)] p-0.5 text-xs">
          <button
            onClick={() => setMode("kline")}
            className={`rounded px-2 py-0.5 ${mode === "kline" ? "bg-blue-600" : "hover:bg-[var(--color-panel-2)]"}`}
          >
            K線
          </button>
          <button
            onClick={() => setMode("trend")}
            className={`rounded px-2 py-0.5 ${mode === "trend" ? "bg-blue-600" : "hover:bg-[var(--color-panel-2)]"}`}
          >
            走勢
          </button>
        </div>

        {mode === "kline" ? (
          <div className="flex rounded-md border border-[var(--color-border)] p-0.5 text-xs">
            {TFS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTf(t.id)}
                className={`rounded px-2 py-0.5 ${tf === t.id ? "bg-blue-600" : "hover:bg-[var(--color-panel-2)]"}`}
              >
                {t.label}
              </button>
            ))}
          </div>
        ) : (
          <div className="flex rounded-md border border-[var(--color-border)] p-0.5 text-xs">
            {RANGES.map((r) => (
              <button
                key={r.id}
                onClick={() => setRange(r.id)}
                className={`rounded px-2 py-0.5 ${range === r.id ? "bg-blue-600" : "hover:bg-[var(--color-panel-2)]"}`}
              >
                {r.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1">
        {mode === "trend" ? (
          <TrendChart stockId={stockId} dailyCandles={candles} range={range} />
        ) : !intraday ? (
          <PriceChart candles={candles} ma={ma} />
        ) : !fugleKey ? (
          <Center>需先在「設定」輸入 Fugle 金鑰才能看分K</Center>
        ) : isLoading ? (
          <Center>載入分K…</Center>
        ) : isError ? (
          <Center>載入失敗：{String((error as Error)?.message ?? error)}</Center>
        ) : !data || data.length === 0 ? (
          <Center>目前無分K資料（盤後或休市）</Center>
        ) : (
          <IntradayChart candles={data} />
        )}
      </div>
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
