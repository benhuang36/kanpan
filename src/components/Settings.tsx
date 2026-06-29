import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { enable, disable, isEnabled } from "@tauri-apps/plugin-autostart";
import {
  useStore,
  type CloseBehavior,
  type ColorUp,
  type Theme,
  type Timeframe,
  type ViewMode,
} from "../store";
import {
  setFinmindToken,
  setFugleKey,
  testFinmind,
  testFugle,
  testAi,
  googleSignIn,
  googleStatus,
  googleSignOut,
} from "../api";
import { checkForUpdate } from "../update";
import { syncNow } from "../sync";

type TestState = { state: "idle" | "testing" | "ok" | "err"; msg: string };
const IDLE: TestState = { state: "idle", msg: "" };

const inputCls =
  "w-full rounded-md border border-[var(--color-border)] bg-[var(--color-panel-2)] px-3 py-2 text-sm outline-none focus:border-blue-500";
const selectCls =
  "rounded-md border border-[var(--color-border)] bg-[var(--color-panel-2)] px-2 py-1.5 text-sm";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border-t border-[var(--color-border)] py-3 first:border-t-0">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
        {title}
      </div>
      {children}
    </div>
  );
}

function TestResult({ s }: { s: TestState }) {
  if (s.state === "idle") return null;
  const color =
    s.state === "ok"
      ? "text-[var(--color-down)]"
      : s.state === "err"
        ? "text-[var(--color-up)]"
        : "text-[var(--color-muted)]";
  const label = s.state === "testing" ? "測試中…" : s.state === "ok" ? `✓ ${s.msg}` : `✕ ${s.msg}`;
  return <span className={`ml-2 text-xs ${color}`}>{label}</span>;
}

export default function Settings({ onClose }: { onClose: () => void }) {
  const store = useStore();
  const qc = useQueryClient();

  // Keys: local until saved (so you can test before committing).
  const [value, setValue] = useState(store.finmindToken);
  const [fugle, setFugle] = useState(store.fugleKey);
  const [endpoint, setEndpoint] = useState(store.aiEndpoint);
  const [model, setModel] = useState(store.aiModel);
  const [aiK, setAiK] = useState(store.aiKey);

  const [finmindT, setFinmindT] = useState<TestState>(IDLE);
  const [fugleT, setFugleT] = useState<TestState>(IDLE);
  const [aiT, setAiT] = useState<TestState>(IDLE);
  const [updateMsg, setUpdateMsg] = useState("");
  const [autostartOn, setAutostartOn] = useState(false);
  const initialAutostart = useRef<boolean | null>(null);

  // Google sync
  const [gId, setGId] = useState(store.googleClientId);
  const [gSecret, setGSecret] = useState(store.googleClientSecret);
  const [googleEmail, setGoogleEmail] = useState<string | null>(null);
  const [googleMsg, setGoogleMsg] = useState("");

  // Snapshot of live-applied prefs at open time, so 取消 can revert them.
  const [snapshot] = useState(() => {
    const s = useStore.getState();
    return {
      theme: s.theme,
      colorUp: s.colorUp,
      closeBehavior: s.closeBehavior,
      defaultView: s.defaultView,
      defaultTimeframe: s.defaultTimeframe,
      maVisible: [...s.maVisible],
      autoCheckUpdate: s.autoCheckUpdate,
      aiTemperature: s.aiTemperature,
      aiTone: s.aiTone,
      pollMinutes: s.pollMinutes,
    };
  });

  useEffect(() => {
    isEnabled()
      .then((on) => {
        setAutostartOn(on);
        if (initialAutostart.current === null) initialAutostart.current = on;
      })
      .catch(() => {});
  }, []);

  // Esc reverts (same as 取消). Capture phase so it beats the global handler.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        cancel();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runTest = async (
    fn: () => Promise<string>,
    set: (s: TestState) => void,
  ) => {
    set({ state: "testing", msg: "" });
    try {
      const msg = await fn();
      set({ state: "ok", msg });
    } catch (e) {
      set({ state: "err", msg: String((e as Error)?.message ?? e) });
    }
  };

  const toggleAutostart = async (on: boolean) => {
    try {
      if (on) await enable();
      else await disable();
      setAutostartOn(on);
    } catch {
      /* ignore */
    }
  };

  const checkUpdate = async () => {
    setUpdateMsg("檢查中…");
    const v = await checkForUpdate();
    setUpdateMsg(v ? `有新版本 v${v}` : "已是最新版本");
  };

  useEffect(() => {
    googleStatus().then(setGoogleEmail).catch(() => {});
  }, []);

  const doGoogleSignIn = async () => {
    store.setGoogle(gId, gSecret);
    setGoogleMsg("等待瀏覽器授權…");
    try {
      const email = await googleSignIn(gId, gSecret);
      setGoogleEmail(email);
      setGoogleMsg("登入成功");
      await syncNow();
    } catch (e) {
      setGoogleMsg(String((e as Error)?.message ?? e));
    }
  };

  const doGoogleSignOut = async () => {
    await googleSignOut();
    setGoogleEmail(null);
    setGoogleMsg("");
  };

  const doSync = async () => {
    setGoogleMsg("同步中…");
    try {
      const r = await syncNow();
      setGoogleMsg(r === "pulled" ? "已從雲端更新" : r === "pushed" ? "已上傳雲端" : "已是最新");
    } catch (e) {
      setGoogleMsg(String((e as Error)?.message ?? e));
    }
  };

  // Revert live-applied prefs to the open-time snapshot, then close.
  const cancel = async () => {
    const { pollMinutes, ...prefs } = snapshot;
    store.setPrefs(prefs);
    store.setPollMinutes(pollMinutes);
    if (initialAutostart.current !== null && initialAutostart.current !== autostartOn) {
      await toggleAutostart(initialAutostart.current);
    }
    onClose();
  };

  // Save (keys) and close. Preferences are applied live via the store.
  const save = async () => {
    store.setToken(value);
    store.setFugleKey(fugle);
    store.setAi({ endpoint, key: aiK, model });
    store.setGoogle(gId, gSecret);
    await setFinmindToken(value || null);
    if (fugle) await setFugleKey(fugle);
    qc.invalidateQueries();
    onClose();
  };

  const toggleMa = (p: number) => {
    const next = store.maVisible.includes(p)
      ? store.maVisible.filter((x) => x !== p)
      : [...store.maVisible, p].sort((a, b) => a - b);
    store.setPrefs({ maVisible: next });
  };

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/50" onClick={cancel}>
      <div
        className="max-h-[86vh] w-[560px] overflow-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-1 text-lg font-semibold">設定</h2>

        <Section title="資料連線">
          <label className="mb-1 block text-sm">FinMind Token（選填）</label>
          <p className="mb-1 text-xs text-[var(--color-muted)]">
            留空可用（300 req/hr）；填入可提升額度。
          </p>
          <div className="flex gap-2">
            <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="FinMind token…" className={inputCls} />
            <button onClick={() => runTest(() => testFinmind(value), setFinmindT)} className="shrink-0 rounded-md border border-[var(--color-border)] px-3 text-sm hover:bg-[var(--color-panel-2)]">測試</button>
          </div>
          <TestResult s={finmindT} />

          <label className="mb-1 mt-3 block text-sm">Fugle API Key（即時報價/五檔/分K）</label>
          <div className="flex gap-2">
            <input value={fugle} onChange={(e) => setFugle(e.target.value)} type="password" placeholder="Fugle API key…" className={inputCls} />
            <button onClick={() => runTest(() => testFugle(fugle), setFugleT)} className="shrink-0 rounded-md border border-[var(--color-border)] px-3 text-sm hover:bg-[var(--color-panel-2)]">測試</button>
          </div>
          <TestResult s={fugleT} />
        </Section>

        <Section title="外觀">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <label className="flex items-center gap-2 text-sm">
              主題
              <select value={store.theme} onChange={(e) => store.setPrefs({ theme: e.target.value as Theme })} className={selectCls}>
                <option value="system">跟隨系統</option>
                <option value="light">亮色</option>
                <option value="dark">深色</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm">
              漲跌顏色
              <select value={store.colorUp} onChange={(e) => store.setPrefs({ colorUp: e.target.value as ColorUp })} className={selectCls}>
                <option value="red">紅漲綠跌（台灣）</option>
                <option value="green">綠漲紅跌（美式）</option>
              </select>
            </label>
          </div>
        </Section>

        <Section title="圖表預設">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <label className="flex items-center gap-2 text-sm">
              開啟畫面
              <select value={store.defaultView} onChange={(e) => store.setPrefs({ defaultView: e.target.value as ViewMode })} className={selectCls}>
                <option value="focus">單檔</option>
                <option value="grid">多檔</option>
                <option value="table">列表</option>
                <option value="compare">比較</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm">
              預設時間框
              <select value={store.defaultTimeframe} onChange={(e) => store.setPrefs({ defaultTimeframe: e.target.value as Timeframe })} className={selectCls}>
                <option value="D">日K</option>
                <option value="1">1分</option>
                <option value="5">5分</option>
                <option value="15">15分</option>
                <option value="60">60分</option>
              </select>
            </label>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span className="text-[var(--color-muted)]">顯示均線</span>
            {[5, 20, 60, 200].map((p) => (
              <label key={p} className="flex items-center gap-1">
                <input type="checkbox" checked={store.maVisible.includes(p)} onChange={() => toggleMa(p)} />
                MA{p}
              </label>
            ))}
          </div>
        </Section>

        <Section title="AI 分析（OpenAI 相容）">
          <input value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder="https://api.openai.com/v1" className={`${inputCls} mb-2`} />
          <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="模型，例如 gpt-4o-mini" className={`${inputCls} mb-2`} />
          <div className="flex gap-2">
            <input value={aiK} onChange={(e) => setAiK(e.target.value)} type="password" placeholder="AI API key…" className={inputCls} />
            <button onClick={() => runTest(() => testAi(endpoint, aiK, model), setAiT)} className="shrink-0 rounded-md border border-[var(--color-border)] px-3 text-sm hover:bg-[var(--color-panel-2)]">測試</button>
          </div>
          <TestResult s={aiT} />
          <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <label className="flex items-center gap-2">
              溫度 {store.aiTemperature.toFixed(1)}
              <input type="range" min="0" max="1" step="0.1" value={store.aiTemperature} onChange={(e) => store.setPrefs({ aiTemperature: Number(e.target.value) })} />
            </label>
            <label className="flex items-center gap-2">
              語氣
              <select value={store.aiTone} onChange={(e) => store.setPrefs({ aiTone: e.target.value })} className={selectCls}>
                <option value="中性">中性</option>
                <option value="保守">保守</option>
                <option value="積極">積極</option>
              </select>
            </label>
          </div>
        </Section>

        <Section title="Google 同步（自選股）">
          {googleEmail ? (
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span>已登入：<b>{googleEmail}</b></span>
              <button onClick={doSync} className="rounded-md bg-blue-600 px-3 py-1 text-xs font-medium hover:bg-blue-500">立即同步</button>
              <button onClick={doGoogleSignOut} className="rounded-md border border-[var(--color-border)] px-3 py-1 text-xs hover:bg-[var(--color-panel-2)]">登出</button>
            </div>
          ) : (
            <>
              <p className="mb-2 text-xs text-[var(--color-muted)]">
                在 Google Cloud 建立「桌面應用程式」OAuth client（啟用 Drive API），把 Client ID /
                Secret 填入後登入，自選股會同步到你自己的 Google Drive。
              </p>
              <input value={gId} onChange={(e) => setGId(e.target.value)} placeholder="Google Client ID" className={`${inputCls} mb-2`} />
              <input value={gSecret} onChange={(e) => setGSecret(e.target.value)} type="password" placeholder="Google Client Secret" className={inputCls} />
              <button onClick={doGoogleSignIn} className="mt-2 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium hover:bg-blue-500">使用 Google 登入</button>
            </>
          )}
          {googleMsg && <div className="mt-2 text-xs text-[var(--color-muted)]">{googleMsg}</div>}
        </Section>

        <Section title="系統">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={autostartOn} onChange={(e) => toggleAutostart(e.target.checked)} />
            開機時自動啟動
          </label>
          <label className="mt-2 flex items-center gap-2 text-sm">
            關閉視窗時
            <select value={store.closeBehavior} onChange={(e) => store.setPrefs({ closeBehavior: e.target.value as CloseBehavior })} className={selectCls}>
              <option value="tray">縮到系統匣（背景持續監控警示）</option>
              <option value="quit">結束程式</option>
            </select>
          </label>
        </Section>

        <Section title="更新與資料">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={store.autoCheckUpdate} onChange={(e) => store.setPrefs({ autoCheckUpdate: e.target.checked })} />
            啟動時自動檢查更新
          </label>
          <div className="mt-2 flex items-center gap-3">
            <button onClick={checkUpdate} className="rounded-md border border-[var(--color-border)] px-3 py-1 text-sm hover:bg-[var(--color-panel-2)]">立即檢查更新</button>
            {updateMsg && <span className="text-xs text-[var(--color-muted)]">{updateMsg}</span>}
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm">
            自動更新間隔（分鐘，0=關）
            <input type="number" min="0" step="1" value={store.pollMinutes} onChange={(e) => store.setPollMinutes(Math.max(0, Math.floor(Number(e.target.value) || 0)))} className="w-20 rounded-md border border-[var(--color-border)] bg-[var(--color-panel-2)] px-2 py-1 text-sm" />
          </label>
        </Section>

        <p className="mt-4 text-[11px] text-[var(--color-muted)]">
          外觀、圖表等偏好即時預覽；按「取消」可還原這次的改動，按「完成」套用並儲存金鑰。
        </p>
        <div className="mt-2 flex justify-end gap-2">
          <button onClick={cancel} className="rounded-md border border-[var(--color-border)] px-4 py-1.5 text-sm hover:bg-[var(--color-panel-2)]">取消</button>
          <button onClick={save} className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium hover:bg-blue-500">完成</button>
        </div>
      </div>
    </div>
  );
}
