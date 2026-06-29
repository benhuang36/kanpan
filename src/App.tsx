import { useEffect, useRef, useState } from "react";
import { useStore } from "./store";
import {
  setFinmindToken,
  setFugleKey,
  fugleSetPlan,
  pushAlerts,
  pushPollMinutes,
  setCloseToTray,
  googleStatus,
} from "./api";
import { startRealtimeListener } from "./realtime";
import { applyTheme } from "./theme";
import { syncNow } from "./sync";
import SearchBar from "./components/SearchBar";
import Watchlist from "./components/Watchlist";
import StockDetail from "./components/StockDetail";
import DashboardGrid from "./components/DashboardGrid";
import CompareView from "./components/CompareView";
import TableView from "./components/TableView";
import Settings from "./components/Settings";
import AlertsModal from "./components/AlertsModal";
import UpdateBanner from "./components/UpdateBanner";
import { AppLogo, BellIcon } from "./components/icons";
import type { ViewMode } from "./store";

function App() {
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const selected = useStore((s) => s.selected);
  const token = useStore((s) => s.finmindToken);
  const fugleKey = useStore((s) => s.fugleKey);
  const watchlist = useStore((s) => s.watchlist);
  const alerts = useStore((s) => s.alerts);
  const pollMinutes = useStore((s) => s.pollMinutes);
  const theme = useStore((s) => s.theme);
  const colorUp = useStore((s) => s.colorUp);
  const closeBehavior = useStore((s) => s.closeBehavior);
  const [showSettings, setShowSettings] = useState(false);
  const [showAlerts, setShowAlerts] = useState(false);

  // Start listening for realtime quote events once; open the default view.
  useEffect(() => {
    startRealtimeListener();
    setView(useStore.getState().defaultView);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Apply theme + colour convention; re-apply on OS theme change when 'system'.
  useEffect(() => {
    applyTheme(theme, colorUp);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (useStore.getState().theme === "system") applyTheme("system", useStore.getState().colorUp);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme, colorUp]);

  // Push close behaviour to the backend (tray vs quit).
  useEffect(() => {
    setCloseToTray(closeBehavior === "tray");
  }, [closeBehavior]);

  // Google sync: pull on startup, then debounce-sync on watch-list changes.
  const syncedInit = useRef(false);
  const watchlistUpdatedAt = useStore((s) => s.watchlistUpdatedAt);
  useEffect(() => {
    const trySync = () =>
      googleStatus()
        .then((email) => {
          if (email) syncNow().catch(() => {});
        })
        .catch(() => {});
    if (!syncedInit.current) {
      syncedInit.current = true;
      trySync();
      return;
    }
    const t = setTimeout(trySync, 3000);
    return () => clearTimeout(t);
  }, [watchlistUpdatedAt]);

  // Keyboard: Cmd/Ctrl+, opens settings; Esc closes open modals.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === ",") {
        e.preventDefault();
        setShowSettings(true);
      } else if (e.key === "Escape") {
        setShowSettings(false);
        setShowAlerts(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Push the persisted FinMind token to the backend on startup.
  useEffect(() => {
    if (token) setFinmindToken(token);
  }, [token]);

  // Push the Fugle key, then (re)subscribe the whole watch list.
  useEffect(() => {
    if (!fugleKey) return;
    setFugleKey(fugleKey);
  }, [fugleKey]);

  // Plan Fugle subscriptions within the free-tier 5-sub budget: the selected
  // stock gets full data (price + 五檔), other watch-list stocks get price only.
  useEffect(() => {
    if (fugleKey) {
      fugleSetPlan(selected, watchlist.map((w) => w.stock_id));
    }
  }, [fugleKey, watchlist, selected]);

  // Sync alert rules and poll interval to the backend engine (which runs the
  // checks off the webview so they keep firing while hidden in the tray).
  useEffect(() => {
    pushAlerts(alerts);
  }, [alerts]);

  useEffect(() => {
    pushPollMinutes(pollMinutes);
  }, [pollMinutes]);

  return (
    <div className="relative flex h-screen flex-col">
      <UpdateBanner />
      <header className="flex items-center gap-4 border-b border-[var(--color-border)] bg-[var(--color-panel)] px-4 py-2">
        <div className="flex items-center gap-2 whitespace-nowrap text-sm font-semibold">
          <AppLogo size={22} />
          KanPan 看盤
        </div>
        <SearchBar />
        <div className="ml-auto flex items-center gap-2">
          <div className="flex rounded-md border border-[var(--color-border)] p-0.5 text-sm">
            {(
              [
                ["focus", "單檔"],
                ["grid", "多檔"],
                ["table", "列表"],
                ["compare", "比較"],
              ] as [ViewMode, string][]
            ).map(([mode, label]) => (
              <button
                key={mode}
                onClick={() => setView(mode)}
                className={`rounded px-3 py-1 ${
                  view === mode ? "bg-blue-600" : "hover:bg-[var(--color-panel-2)]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowAlerts(true)}
            className="flex items-center gap-1.5 rounded-md border border-[var(--color-border)] px-3 py-1 text-sm hover:bg-[var(--color-panel-2)]"
          >
            <BellIcon size={14} />
            警示
          </button>
          <button
            onClick={() => setShowSettings(true)}
            className="rounded-md border border-[var(--color-border)] px-3 py-1 text-sm hover:bg-[var(--color-panel-2)]"
          >
            設定
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="w-64 shrink-0 border-r border-[var(--color-border)] bg-[var(--color-panel)]">
          <Watchlist />
        </aside>
        <main className="min-w-0 flex-1">
          {view === "grid" ? (
            <DashboardGrid />
          ) : view === "table" ? (
            <TableView />
          ) : view === "compare" ? (
            <CompareView />
          ) : selected ? (
            <StockDetail stockId={selected} />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-[var(--color-muted)]">
              從左側自選股選一檔，或用搜尋框加入
            </div>
          )}
        </main>
      </div>

      {showSettings && <Settings onClose={() => setShowSettings(false)} />}
      {showAlerts && <AlertsModal onClose={() => setShowAlerts(false)} />}
    </div>
  );
}

export default App;
