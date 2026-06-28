import { create } from "zustand";

export interface AiResult {
  text: string;
  loading: boolean;
  error: string;
}

const EMPTY: AiResult = { text: "", loading: false, error: "" };

interface AiStore {
  results: Record<string, AiResult>;
  get: (stockId: string) => AiResult;
  patch: (stockId: string, partial: Partial<AiResult>) => void;
}

/** In-memory cache of AI analysis per stock, so results survive tab/stock switches. */
export const useAiStore = create<AiStore>((set, getState) => ({
  results: {},
  get: (stockId) => getState().results[stockId] ?? EMPTY,
  patch: (stockId, partial) =>
    set((s) => ({
      results: {
        ...s.results,
        [stockId]: { ...(s.results[stockId] ?? EMPTY), ...partial },
      },
    })),
}));
