import { invoke } from "@tauri-apps/api/core";
import type { IntradayCandle, StockDetail, SymbolInfo } from "./types";

export const searchSymbols = (query: string) =>
  invoke<SymbolInfo[]>("search_symbols", { query });

export const getStockDetail = (stockId: string) =>
  invoke<StockDetail>("get_stock_detail", { stockId });

export const refreshSymbols = () => invoke<number>("refresh_symbols");

export const setFinmindToken = (token: string | null) =>
  invoke<void>("set_finmind_token", { token });

export const finmindTokenSet = () => invoke<boolean>("finmind_token_set");

export const setFugleKey = (key: string) => invoke<void>("set_fugle_key", { key });

export const fugleKeySet = () => invoke<boolean>("fugle_key_set");

export const fugleSubscribe = (stockIds: string[]) =>
  invoke<void>("fugle_subscribe", { stockIds });

export const fugleUnsubscribe = (stockId: string) =>
  invoke<void>("fugle_unsubscribe", { stockId });

export const getIntradayCandles = (stockId: string, timeframe: string) =>
  invoke<IntradayCandle[]>("get_intraday_candles", { stockId, timeframe });

export const aiChat = (args: {
  endpoint: string;
  apiKey: string;
  model: string;
  system: string;
  user: string;
}) => invoke<string>("ai_chat", args);
