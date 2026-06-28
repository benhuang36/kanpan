import { useEffect, useRef } from "react";
import { useStore } from "../store";
import { useRealtime } from "../realtime";
import { useWatchlistDetails } from "../hooks";
import { ruleMet, ruleMetric, ruleSummary } from "../alerts";
import { notify } from "../notify";
import type { StockDetail } from "../types";

/** Headless engine: watches metrics and fires desktop notifications when a rule
 * transitions from unmet → met (so it fires once per crossing, not every tick). */
export default function AlertEngine() {
  const alerts = useStore((s) => s.alerts);
  const watchlist = useStore((s) => s.watchlist);
  const results = useWatchlistDetails(watchlist);
  const quotes = useRealtime((s) => s.quotes);
  const triggered = useRef<Map<string, boolean>>(new Map());

  useEffect(() => {
    const detailById = new Map<string, StockDetail | undefined>();
    results.forEach((r) => detailById.set(r.item.stock_id, r.detail));

    for (const rule of alerts) {
      if (!rule.enabled) {
        triggered.current.set(rule.id, false);
        continue;
      }
      const metric = ruleMetric(rule, detailById.get(rule.stock_id), quotes[rule.stock_id]);
      const met = ruleMet(rule, metric);
      const was = triggered.current.get(rule.id) ?? false;

      if (met && !was) {
        notify(
          `🔔 ${rule.stock_id} ${rule.stock_name}`,
          `${ruleSummary(rule)}（目前 ${metric?.toFixed(2)}）`,
        );
      }
      triggered.current.set(rule.id, met);
    }
  }, [alerts, quotes, results]);

  return null;
}
