import { useEffect, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { checkForUpdate, RELEASES_URL } from "../update";
import { useStore } from "../store";

export default function UpdateBanner() {
  const [latest, setLatest] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const autoCheckUpdate = useStore((s) => s.autoCheckUpdate);

  useEffect(() => {
    if (!autoCheckUpdate) return;
    checkForUpdate().then((v) => {
      if (v) setLatest(v);
    });
  }, [autoCheckUpdate]);

  if (!latest || dismissed) return null;

  return (
    <div className="pointer-events-none absolute left-1/2 top-14 z-40 -translate-x-1/2">
      <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-blue-500/40 bg-[var(--color-panel)] px-4 py-1.5 text-sm shadow-xl">
        <span>
          有新版本 <span className="font-semibold text-blue-400">v{latest}</span>
        </span>
        <button
          onClick={() => openUrl(RELEASES_URL).catch(() => {})}
          className="rounded-full bg-blue-600 px-3 py-0.5 text-xs font-medium hover:bg-blue-500"
        >
          前往下載
        </button>
        <button
          onClick={() => setDismissed(true)}
          className="text-[var(--color-muted)] hover:text-[var(--color-text)]"
          title="關閉"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
