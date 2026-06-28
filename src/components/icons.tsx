// Shared inline SVG icons.

/** The KanPan app icon (rounded candlestick tile), matching src-tauri/app-icon.svg. */
export function AppLogo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 340 340" aria-hidden="true">
      <rect x="0" y="0" width="340" height="340" rx="78" fill="#0e1320" stroke="#232a3a" strokeWidth="2" />
      <line x1="80" y1="175" x2="80" y2="285" stroke="#1eb854" strokeWidth="14" strokeLinecap="round" />
      <rect x="63" y="190" width="34" height="80" rx="6" fill="#1eb854" />
      <line x1="140" y1="135" x2="140" y2="255" stroke="#e23b3b" strokeWidth="14" strokeLinecap="round" />
      <rect x="123" y="150" width="34" height="90" rx="6" fill="#e23b3b" />
      <line x1="200" y1="95" x2="200" y2="215" stroke="#e23b3b" strokeWidth="14" strokeLinecap="round" />
      <rect x="183" y="110" width="34" height="90" rx="6" fill="#e23b3b" />
      <line x1="260" y1="55" x2="260" y2="190" stroke="#e23b3b" strokeWidth="14" strokeLinecap="round" />
      <rect x="243" y="70" width="34" height="105" rx="6" fill="#e23b3b" />
      <polyline points="80,230 140,195 200,155 260,120 292,98" fill="none" stroke="#eef1f8" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="292" cy="98" r="13" fill="#eef1f8" />
    </svg>
  );
}

/** Flat outline bell, inherits color via currentColor. */
export function BellIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </svg>
  );
}
