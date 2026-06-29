import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { GLOSSARY } from "../glossary";

/**
 * A small ⓘ icon that shows a plain-language explanation on hover/focus.
 * The bubble renders in a portal with fixed positioning so it is never clipped
 * by scrollable parent panels.
 */
export default function InfoTip({ term, text }: { term?: string; text?: string }) {
  const body = text ?? (term ? GLOSSARY[term] : "") ?? "";
  const ref = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const show = () => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const width = 260;
    const left = Math.min(r.left, window.innerWidth - width - 12);
    setPos({ top: r.bottom + 6, left: Math.max(8, left) });
  };
  const hide = () => setPos(null);

  if (!body) return null;

  return (
    <span
      ref={ref}
      tabIndex={0}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      className="ml-0.5 inline-flex h-3.5 w-3.5 cursor-help items-center justify-center rounded-full border border-[var(--color-border)] text-[9px] leading-none text-[var(--color-muted)] hover:border-blue-500 hover:text-blue-400"
      aria-label={body}
    >
      i
      {pos &&
        createPortal(
          <div
            style={{ position: "fixed", top: pos.top, left: pos.left, width: 260 }}
            className="z-50 rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] p-2.5 text-[11px] leading-relaxed text-[var(--color-text)] shadow-xl"
          >
            {body}
          </div>,
          document.body,
        )}
    </span>
  );
}
