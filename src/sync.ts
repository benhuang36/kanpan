import { googleSyncPull, googleSyncPush } from "./api";
import { useStore, type WatchItem } from "./store";

interface SyncBlob {
  watchlist: WatchItem[];
  syncedAt: number;
}

/**
 * Two-way watch-list sync via Google Drive (last-write-wins by timestamp):
 * pull remote; if it's newer, adopt it; otherwise push local.
 * Returns a short status for the UI. Throws on transport/auth errors.
 */
export async function syncNow(): Promise<"pulled" | "pushed" | "in-sync"> {
  const s = useStore.getState();
  const localTs = s.watchlistUpdatedAt;

  const remoteRaw = await googleSyncPull();
  if (remoteRaw) {
    let remote: SyncBlob | null = null;
    try {
      remote = JSON.parse(remoteRaw) as SyncBlob;
    } catch {
      remote = null;
    }
    if (remote && Array.isArray(remote.watchlist)) {
      const remoteTs = remote.syncedAt ?? 0;
      if (remoteTs > localTs) {
        s.applyRemoteWatchlist(remote.watchlist, remoteTs);
        return "pulled";
      }
      if (remoteTs === localTs) return "in-sync";
    }
  }

  const blob: SyncBlob = { watchlist: s.watchlist, syncedAt: localTs };
  await googleSyncPush(JSON.stringify(blob));
  return "pushed";
}
