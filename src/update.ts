import { getVersion } from "@tauri-apps/api/app";

const REPO = "benhuang36/kanpan";
export const RELEASES_URL = `https://github.com/${REPO}/releases/latest`;

/** Compare dotted version strings; true if `a` is strictly newer than `b`. */
function isNewer(a: string, b: string): boolean {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}

/**
 * Check the latest published GitHub release against the running version.
 * Returns the newer version string (e.g. "0.4.4") or null. Fails silently
 * (offline / rate-limited / draft-only).
 */
export async function checkForUpdate(): Promise<string | null> {
  try {
    const current = await getVersion();
    const res = await fetch(
      `https://api.github.com/repos/${REPO}/releases/latest`,
      { headers: { Accept: "application/vnd.github+json" } },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { tag_name?: string };
    const latest = (data.tag_name ?? "").replace(/^v/, "");
    return latest && isNewer(latest, current) ? latest : null;
  } catch {
    return null;
  }
}
