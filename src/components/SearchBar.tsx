import { useEffect, useRef, useState } from "react";
import { useSymbolSearch } from "../hooks";
import { useStore } from "../store";

export default function SearchBar() {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const add = useStore((s) => s.add);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 200);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const { data, isFetching } = useSymbolSearch(debounced);

  return (
    <div ref={boxRef} className="relative w-80">
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="搜尋股票代號或名稱…  (e.g. 2330 / 台積電)"
        className="w-full rounded-md bg-[var(--color-panel-2)] border border-[var(--color-border)] px-3 py-2 text-sm outline-none focus:border-blue-500"
      />
      {open && debounced.trim() && (
        <div className="absolute z-20 mt-1 w-full max-h-80 overflow-auto rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] shadow-xl">
          {isFetching && <div className="px-3 py-2 text-xs text-[var(--color-muted)]">搜尋中…</div>}
          {!isFetching && (data?.length ?? 0) === 0 && (
            <div className="px-3 py-2 text-xs text-[var(--color-muted)]">查無結果</div>
          )}
          {data?.map((s) => (
            <button
              key={s.stock_id}
              onClick={() => {
                add(s);
                setQuery("");
                setOpen(false);
              }}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-[var(--color-panel-2)]"
            >
              <span>
                <span className="font-mono text-blue-400">{s.stock_id}</span>{" "}
                <span>{s.stock_name}</span>
              </span>
              <span className="text-xs text-[var(--color-muted)]">{s.industry_category}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
