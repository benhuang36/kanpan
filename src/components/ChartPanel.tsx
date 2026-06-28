import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getIntradayCandles } from "../api";
import { useStore } from "../store";
import PriceChart from "./PriceChart";
import IntradayChart from "./IntradayChart";
import type { Candle, MaSeries } from "../types";

type TF = "D" | "1" | "5" | "15" | "60";

const TFS: { id: TF; label: string }[] = [
  { id: "D", label: "日K" },
  { id: "1", label: "1分" },
  { id: "5", label: "5分" },
  { id: "15", label: "15分" },
  { id: "60", label: "60分" },
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
  const [tf, setTf] = useState<TF>("D");
  const fugleKey = useStore((s) => s.fugleKey);
  const intraday = tf !== "D";

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["intraday", stockId, tf],
    queryFn: () => getIntradayCandles(stockId, tf),
    enabled: intraday && !!fugleKey,
    refetchInterval: intraday ? 30_000 : false, // 盤中自動更新
  });

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-1 px-2 py-1">
        <div className="flex rounded-md border border-[var(--color-border)] p-0.5 text-xs">
          {TFS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTf(t.id)}
              className={`rounded px-2 py-0.5 ${
                tf === t.id ? "bg-blue-600" : "hover:bg-[var(--color-panel-2)]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {intraday && (
          <span className="text-[11px] text-[var(--color-muted)]">分K 由 Fugle 提供，盤中每 30 秒更新</span>
        )}
      </div>

      <div className="min-h-0 flex-1">
        {!intraday ? (
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
