import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import type { RealtimeQuote } from "./types";

interface RealtimeState {
  quotes: Record<string, RealtimeQuote>;
  setQuote: (q: RealtimeQuote) => void;
}

export const useRealtime = create<RealtimeState>((set) => ({
  quotes: {},
  setQuote: (q) =>
    set((s) => ({ quotes: { ...s.quotes, [q.stock_id]: q } })),
}));

/** Convenience selector for a single symbol's latest realtime quote. */
export function useQuote(stockId: string | null): RealtimeQuote | undefined {
  return useRealtime((s) => (stockId ? s.quotes[stockId] : undefined));
}

let started = false;

/** Wire the backend `fugle://quote` event stream into the store. Idempotent. */
export function startRealtimeListener() {
  if (started) return;
  started = true;
  listen<RealtimeQuote>("fugle://quote", (event) => {
    useRealtime.getState().setQuote(event.payload);
  });
}
