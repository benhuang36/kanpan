import { useState } from "react";
import { useStockDetail } from "../hooks";
import { useQuote } from "../realtime";
import PriceHeader from "./PriceHeader";
import ChartPanel from "./ChartPanel";
import InstitutionalPanel from "./InstitutionalPanel";
import IndicatorsPanel from "./IndicatorsPanel";
import ValuationPanel from "./ValuationPanel";
import OrderBook from "./OrderBook";
import AiAnalysisPanel from "./AiAnalysisPanel";

type Tab = "inst" | "indicators" | "valuation" | "ai";

const TABS: { id: Tab; label: string }[] = [
  { id: "inst", label: "三大法人" },
  { id: "indicators", label: "技術指標" },
  { id: "valuation", label: "估值/籌碼" },
  { id: "ai", label: "AI 分析" },
];

export default function StockDetail({ stockId }: { stockId: string }) {
  const { data, isLoading, isError, error } = useStockDetail(stockId);
  const rt = useQuote(stockId);
  const [tab, setTab] = useState<Tab>("inst");

  if (isLoading) {
    return <div className="p-6 text-sm text-[var(--color-muted)]">載入中…</div>;
  }
  if (isError) {
    return (
      <div className="p-6 text-sm text-[var(--color-up)]">
        載入失敗：{String((error as Error)?.message ?? error)}
      </div>
    );
  }
  if (!data) return null;

  return (
    <div className="flex h-full flex-col">
      <PriceHeader s={data.summary} rt={rt} />
      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1">
          <ChartPanel stockId={stockId} candles={data.candles} ma={data.ma} />
        </div>
        <div className="w-48 shrink-0 overflow-auto border-l border-[var(--color-border)]">
          <OrderBook quote={rt} />
        </div>
      </div>

      <div className="flex max-h-80 flex-col border-t border-[var(--color-border)]">
        <div className="flex shrink-0 gap-1 px-2 pt-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`rounded-t px-3 py-1 text-xs ${
                tab === t.id
                  ? "bg-[var(--color-panel-2)] text-[var(--color-text)]"
                  : "text-[var(--color-muted)] hover:text-[var(--color-text)]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1 overflow-auto bg-[var(--color-panel-2)]/30">
          {tab === "inst" && <InstitutionalPanel data={data.institutional} />}
          {tab === "indicators" && <IndicatorsPanel candles={data.candles} ind={data.indicators} />}
          {tab === "valuation" && (
            <ValuationPanel valuation={data.valuation} margin={data.margin} />
          )}
          {tab === "ai" && <AiAnalysisPanel detail={data} rt={rt} />}
        </div>
      </div>
    </div>
  );
}
