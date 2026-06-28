import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useStore } from "../store";
import { setFinmindToken, setFugleKey } from "../api";

export default function Settings({ onClose }: { onClose: () => void }) {
  const token = useStore((s) => s.finmindToken);
  const setToken = useStore((s) => s.setToken);
  const fugleKey = useStore((s) => s.fugleKey);
  const setFugleKeyStore = useStore((s) => s.setFugleKey);
  const aiEndpoint = useStore((s) => s.aiEndpoint);
  const aiKey = useStore((s) => s.aiKey);
  const aiModel = useStore((s) => s.aiModel);
  const setAi = useStore((s) => s.setAi);
  const pollMinutes = useStore((s) => s.pollMinutes);
  const setPollMinutes = useStore((s) => s.setPollMinutes);
  const [value, setValue] = useState(token);
  const [fugle, setFugle] = useState(fugleKey);
  const [endpoint, setEndpoint] = useState(aiEndpoint);
  const [model, setModel] = useState(aiModel);
  const [aiK, setAiK] = useState(aiKey);
  const [poll, setPoll] = useState(String(pollMinutes));
  const qc = useQueryClient();

  const save = async () => {
    setToken(value);
    setFugleKeyStore(fugle);
    setAi({ endpoint, key: aiK, model });
    const p = Math.max(0, Math.floor(Number(poll) || 0));
    setPollMinutes(p);
    await setFinmindToken(value || null);
    if (fugle) await setFugleKey(fugle);
    qc.invalidateQueries();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="w-[480px] rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-3 text-lg font-semibold">設定</h2>

        <label className="mb-1 block text-sm">FinMind API Token（選填）</label>
        <p className="mb-2 text-xs text-[var(--color-muted)]">
          未填可用，但免費額度較低 (300 req/hr)。註冊 finmindtrade.com 後填入 token 可提升至 600
          req/hr。
        </p>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="貼上 FinMind token…"
          className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-panel-2)] px-3 py-2 text-sm outline-none focus:border-blue-500"
        />

        <label className="mb-1 mt-4 block text-sm">Fugle API Key（即時報價/內外盤）</label>
        <p className="mb-2 text-xs text-[var(--color-muted)]">
          於 developer.fugle.tw 申請。填入後盤中 (09:00–13:30) 會顯示即時價與五檔內外盤。金鑰只存在本機。
        </p>
        <input
          value={fugle}
          onChange={(e) => setFugle(e.target.value)}
          type="password"
          placeholder="貼上 Fugle API key…"
          className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-panel-2)] px-3 py-2 text-sm outline-none focus:border-blue-500"
        />

        <div className="my-4 border-t border-[var(--color-border)]" />

        <label className="mb-1 block text-sm">AI 分析（OpenAI 相容 API）</label>
        <p className="mb-2 text-xs text-[var(--color-muted)]">
          填入 OpenAI 相容服務的 base URL（結尾通常為 /v1）、模型名稱與 API key，即可在單檔的「AI
          分析」分頁產生分析。金鑰只存在本機。
        </p>
        <input
          value={endpoint}
          onChange={(e) => setEndpoint(e.target.value)}
          placeholder="https://api.openai.com/v1"
          className="mb-2 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-panel-2)] px-3 py-2 text-sm outline-none focus:border-blue-500"
        />
        <input
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder="模型名稱，例如 gpt-4o-mini"
          className="mb-2 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-panel-2)] px-3 py-2 text-sm outline-none focus:border-blue-500"
        />
        <input
          value={aiK}
          onChange={(e) => setAiK(e.target.value)}
          type="password"
          placeholder="貼上 AI API key…"
          className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-panel-2)] px-3 py-2 text-sm outline-none focus:border-blue-500"
        />

        <div className="my-4 border-t border-[var(--color-border)]" />

        <label className="mb-1 block text-sm">自動更新間隔（分鐘）</label>
        <p className="mb-2 text-xs text-[var(--color-muted)]">
          每隔幾分鐘自動重抓自選股資料以更新均線/法人/RSI 並評估警示；即時報價(Fugle)不受此影響。設為
          0 可關閉自動更新。程式縮到系統匣時仍會持續更新。
        </p>
        <input
          value={poll}
          onChange={(e) => setPoll(e.target.value)}
          type="number"
          min="0"
          step="1"
          className="w-28 rounded-md border border-[var(--color-border)] bg-[var(--color-panel-2)] px-3 py-2 text-sm outline-none focus:border-blue-500"
        />

        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm hover:bg-[var(--color-panel-2)]"
          >
            取消
          </button>
          <button
            onClick={save}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium hover:bg-blue-500"
          >
            儲存
          </button>
        </div>
      </div>
    </div>
  );
}
