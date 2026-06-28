import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { SymbolInfo } from "./types";

export type ViewMode = "focus" | "grid" | "compare" | "table";

export interface WatchItem {
  stock_id: string;
  stock_name: string;
}

export type AlertKind =
  | "price_above"
  | "price_below"
  | "pct_above"
  | "pct_below"
  | "rsi_above"
  | "rsi_below";

export interface AlertRule {
  id: string;
  stock_id: string;
  stock_name: string;
  kind: AlertKind;
  value: number;
  enabled: boolean;
}

interface AppState {
  watchlist: WatchItem[];
  selected: string | null;
  view: ViewMode;
  finmindToken: string;
  fugleKey: string;
  aiEndpoint: string;
  aiKey: string;
  aiModel: string;
  alerts: AlertRule[];

  add: (s: SymbolInfo) => void;
  remove: (stockId: string) => void;
  select: (stockId: string) => void;
  setView: (v: ViewMode) => void;
  setToken: (t: string) => void;
  setFugleKey: (k: string) => void;
  setAi: (cfg: { endpoint: string; key: string; model: string }) => void;
  addAlert: (a: Omit<AlertRule, "id" | "enabled">) => void;
  removeAlert: (id: string) => void;
  toggleAlert: (id: string) => void;
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      watchlist: [],
      selected: null,
      view: "focus",
      finmindToken: "",
      fugleKey: "",
      aiEndpoint: "https://api.openai.com/v1",
      aiKey: "",
      aiModel: "gpt-4o-mini",
      alerts: [],

      add: (s) => {
        if (get().watchlist.some((w) => w.stock_id === s.stock_id)) {
          set({ selected: s.stock_id });
          return;
        }
        set((state) => ({
          watchlist: [...state.watchlist, { stock_id: s.stock_id, stock_name: s.stock_name }],
          selected: s.stock_id,
        }));
      },

      remove: (stockId) =>
        set((state) => {
          const watchlist = state.watchlist.filter((w) => w.stock_id !== stockId);
          const selected =
            state.selected === stockId ? watchlist[0]?.stock_id ?? null : state.selected;
          return { watchlist, selected };
        }),

      select: (stockId) => set({ selected: stockId }),
      setView: (view) => set({ view }),
      setToken: (finmindToken) => set({ finmindToken }),
      setFugleKey: (fugleKey) => set({ fugleKey }),
      setAi: ({ endpoint, key, model }) =>
        set({ aiEndpoint: endpoint, aiKey: key, aiModel: model }),

      addAlert: (a) =>
        set((state) => ({
          alerts: [
            ...state.alerts,
            { ...a, id: crypto.randomUUID(), enabled: true },
          ],
        })),
      removeAlert: (id) =>
        set((state) => ({ alerts: state.alerts.filter((x) => x.id !== id) })),
      toggleAlert: (id) =>
        set((state) => ({
          alerts: state.alerts.map((x) =>
            x.id === id ? { ...x, enabled: !x.enabled } : x,
          ),
        })),
    }),
    { name: "stock-dashboard" },
  ),
);
