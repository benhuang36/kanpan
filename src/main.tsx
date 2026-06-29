import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getCurrentWindow } from "@tauri-apps/api/window";
import App from "./App";
import { useStore } from "./store";
import { applyTheme } from "./theme";
import "./index.css";

// Apply persisted theme + colour convention before first paint (avoids flash).
{
  const s = useStore.getState();
  applyTheme(s.theme, s.colorUp);
}

// Native-app feel: suppress the browser context menu everywhere except in
// editable fields (so right-click paste still works in inputs).
document.addEventListener("contextmenu", (e) => {
  const el = e.target as HTMLElement | null;
  if (!el?.closest('input, textarea, [contenteditable="true"]')) {
    e.preventDefault();
  }
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
);

// Reveal the window only after the first frame is painted (window starts hidden
// with a dark background) to avoid the white flash on startup.
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    getCurrentWindow()
      .show()
      .catch(() => {});
  });
});
