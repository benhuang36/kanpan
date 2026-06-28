import { useState } from "react";
import { useStore, type AlertKind } from "../store";
import { ALERT_KIND_LABEL, ruleSummary } from "../alerts";
import { ensureNotifyPermission } from "../notify";

const KINDS: AlertKind[] = [
  "price_above",
  "price_below",
  "pct_above",
  "pct_below",
  "rsi_above",
  "rsi_below",
];

export default function AlertsModal({ onClose }: { onClose: () => void }) {
  const watchlist = useStore((s) => s.watchlist);
  const alerts = useStore((s) => s.alerts);
  const addAlert = useStore((s) => s.addAlert);
  const removeAlert = useStore((s) => s.removeAlert);
  const toggleAlert = useStore((s) => s.toggleAlert);

  const [stockId, setStockId] = useState(watchlist[0]?.stock_id ?? "");
  const [kind, setKind] = useState<AlertKind>("price_above");
  const [value, setValue] = useState("");

  const add = async () => {
    const v = parseFloat(value);
    const stock = watchlist.find((w) => w.stock_id === stockId);
    if (!stock || Number.isNaN(v)) return;
    await ensureNotifyPermission();
    addAlert({ stock_id: stock.stock_id, stock_name: stock.stock_name, kind, value: v });
    setValue("");
  };

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-[560px] rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-3 text-lg font-semibold">🔔 價格 / 指標警示</h2>

        {watchlist.length === 0 ? (
          <p className="text-sm text-[var(--color-muted)]">請先加入自選股，才能設定警示。</p>
        ) : (
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label className="mb-1 block text-[11px] text-[var(--color-muted)]">股票</label>
              <select
                value={stockId}
                onChange={(e) => setStockId(e.target.value)}
                className="rounded-md border border-[var(--color-border)] bg-[var(--color-panel-2)] px-2 py-1.5 text-sm"
              >
                {watchlist.map((w) => (
                  <option key={w.stock_id} value={w.stock_id}>
                    {w.stock_id} {w.stock_name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] text-[var(--color-muted)]">條件</label>
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as AlertKind)}
                className="rounded-md border border-[var(--color-border)] bg-[var(--color-panel-2)] px-2 py-1.5 text-sm"
              >
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {ALERT_KIND_LABEL[k]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] text-[var(--color-muted)]">數值</label>
              <input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                type="number"
                step="any"
                className="w-24 rounded-md border border-[var(--color-border)] bg-[var(--color-panel-2)] px-2 py-1.5 text-sm"
              />
            </div>
            <button
              onClick={add}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium hover:bg-blue-500"
            >
              新增
            </button>
          </div>
        )}

        <div className="mt-4 max-h-64 overflow-auto">
          {alerts.length === 0 ? (
            <div className="py-4 text-center text-xs text-[var(--color-muted)]">尚無警示</div>
          ) : (
            alerts.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between border-t border-[var(--color-border)] py-2 text-sm"
              >
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={a.enabled}
                    onChange={() => toggleAlert(a.id)}
                  />
                  <span className={a.enabled ? "" : "text-[var(--color-muted)] line-through"}>
                    {ruleSummary(a)}{" "}
                    <span className="font-mono text-xs text-[var(--color-muted)]">{a.stock_id}</span>
                  </span>
                </label>
                <button
                  onClick={() => removeAlert(a.id)}
                  className="text-[var(--color-muted)] hover:text-[var(--color-up)]"
                >
                  刪除
                </button>
              </div>
            ))
          )}
        </div>

        <p className="mt-3 text-[11px] text-[var(--color-muted)]">
          條件由未達成轉為達成時，發送一次桌面通知。即時類條件需盤中且已設定 Fugle 金鑰；RSI 為當日
          EOD 值。
        </p>

        <div className="mt-4 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm hover:bg-[var(--color-panel-2)]"
          >
            關閉
          </button>
        </div>
      </div>
    </div>
  );
}
