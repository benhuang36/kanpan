import { useQueries, useQuery } from "@tanstack/react-query";
import { getStockDetail, searchSymbols } from "./api";
import type { StockDetail } from "./types";
import type { WatchItem } from "./store";

export function useStockDetail(stockId: string | null) {
  return useQuery({
    queryKey: ["detail", stockId],
    queryFn: () => getStockDetail(stockId as string),
    enabled: !!stockId,
  });
}

/** Fetch details for every watch-list item (shared cache with useStockDetail). */
export function useWatchlistDetails(items: WatchItem[]) {
  return useQueries({
    queries: items.map((item) => ({
      queryKey: ["detail", item.stock_id],
      queryFn: () => getStockDetail(item.stock_id),
    })),
    combine: (results) =>
      items.map((item, i) => ({
        item,
        detail: results[i].data as StockDetail | undefined,
      })),
  });
}

export function useSymbolSearch(query: string) {
  return useQuery({
    queryKey: ["search", query],
    queryFn: () => searchSymbols(query),
    enabled: query.trim().length > 0,
    staleTime: 5 * 60_000,
  });
}
