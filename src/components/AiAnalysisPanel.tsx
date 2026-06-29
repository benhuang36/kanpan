import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useStore } from "../store";
import { useAiStore } from "../aiStore";
import { aiChat } from "../api";
import { AI_SYSTEM_PROMPT, buildAnalysisPrompt, toneInstruction } from "../ai";
import type { RealtimeQuote, StockDetail } from "../types";

export default function AiAnalysisPanel({
  detail,
  rt,
}: {
  detail: StockDetail;
  rt?: RealtimeQuote;
}) {
  const aiEndpoint = useStore((s) => s.aiEndpoint);
  const aiKey = useStore((s) => s.aiKey);
  const aiModel = useStore((s) => s.aiModel);
  const aiTemperature = useStore((s) => s.aiTemperature);
  const aiTone = useStore((s) => s.aiTone);

  const stockId = detail.summary.stock_id;
  const { text: result, loading, error } = useAiStore((s) => s.results[stockId]) ?? {
    text: "",
    loading: false,
    error: "",
  };
  const patch = useAiStore((s) => s.patch);

  const configured = !!aiEndpoint && !!aiKey;

  const run = async () => {
    patch(stockId, { loading: true, error: "", text: "" });
    try {
      const text = await aiChat({
        endpoint: aiEndpoint,
        apiKey: aiKey,
        model: aiModel,
        system: `${AI_SYSTEM_PROMPT}\n${toneInstruction(aiTone)}`,
        user: buildAnalysisPrompt(detail, rt),
        temperature: aiTemperature,
      });
      patch(stockId, { text, loading: false });
    } catch (e) {
      patch(stockId, { error: String((e as Error)?.message ?? e), loading: false });
    }
  };

  return (
    <div className="p-3">
      <div className="mb-2 flex items-center gap-3">
        <button
          onClick={run}
          disabled={!configured || loading}
          className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "分析中…" : "產生 AI 分析"}
        </button>
        <span className="text-[11px] text-[var(--color-muted)]">
          {configured ? `模型：${aiModel}` : "請先到「設定」填入 AI endpoint 與 API key"}
        </span>
      </div>

      {error && <div className="mb-2 text-xs text-[var(--color-up)]">錯誤：{error}</div>}

      {result && (
        <div className="md rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] p-3">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{result}</ReactMarkdown>
        </div>
      )}

      <p className="mt-3 text-[11px] text-[var(--color-muted)]">
        ⚠️ AI 分析由你設定的模型生成，可能有錯誤或過時資訊，且未必使用即時數據。僅供教育參考，非投資建議。
      </p>
    </div>
  );
}
