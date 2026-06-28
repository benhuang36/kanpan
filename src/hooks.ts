import { useQueries, useQuery } from "@tanstack/react-query";
import { getStockDetail, searchSymbols } from "./api";
import type { StockDetail } from "./types";
import { useStore, type WatchItem } from "./store";

/** Polling interval (ms) from settings; `false` disables auto-refresh. */
function usePollInterval(): number | false {
  const minutes = useStore((s) => s.pollMinutes);
  return minutes > 0 ? minutes * 60_000 : false;
}

export function useStockDetail(stockId: string | null) {
  const refetchInterval = usePollInterval();
  return useQuery({
    queryKey: ["detail", stockId],
    queryFn: () => getStockDetail(stockId as string),
    enabled: !!stockId,
    refetchInterval,
    refetchIntervalInBackground: true, // keep polling while hidden in the tray
  });
}

/** Fetch details for every watch-list item (shared cache with useStockDetail). */
export function useWatchlistDetails(items: WatchItem[]) {
  const refetchInterval = usePollInterval();
  return useQueries({
    queries: items.map((item) => ({
      queryKey: ["detail", item.stock_id],
      queryFn: () => getStockDetail(item.stock_id),
      refetchInterval,
      refetchIntervalInBackground: true,
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
