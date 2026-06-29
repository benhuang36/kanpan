import { invoke } from "@tauri-apps/api/core";
import type { IntradayCandle, StockDetail, SymbolInfo } from "./types";
import type { AlertRule } from "./store";

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

export const fugleSetPlan = (focus: string | null, watch: string[]) =>
  invoke<void>("fugle_set_plan", { focus, watch });

export const getIntradayCandles = (stockId: string, timeframe: string) =>
  invoke<IntradayCandle[]>("get_intraday_candles", { stockId, timeframe });

export const pushAlerts = (alerts: AlertRule[]) =>
  invoke<void>("set_alerts", { alerts });

export const pushPollMinutes = (minutes: number) =>
  invoke<void>("set_poll_minutes", { minutes });

export const setCloseToTray = (enabled: boolean) =>
  invoke<void>("set_close_to_tray", { enabled });

export const aiChat = (args: {
  endpoint: string;
  apiKey: string;
  model: string;
  system: string;
  user: string;
  temperature: number;
}) => invoke<string>("ai_chat", args);

// Connection tests (settings) — resolve with a success message, reject on error.
export const testFinmind = (token: string) =>
  invoke<string>("test_finmind", { token });

export const testFugle = (key: string) => invoke<string>("test_fugle", { key });

export const testAi = (endpoint: string, apiKey: string, model: string) =>
  invoke<string>("test_ai", { endpoint, apiKey, model });
