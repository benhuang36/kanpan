import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";

let granted: boolean | null = null;

export async function ensureNotifyPermission(): Promise<boolean> {
  if (granted) return true;
  let ok = await isPermissionGranted();
  if (!ok) {
    ok = (await requestPermission()) === "granted";
  }
  granted = ok;
  return ok;
}

export async function notify(title: string, body: string): Promise<void> {
  if (await ensureNotifyPermission()) {
    sendNotification({ title, body });
  }
}
