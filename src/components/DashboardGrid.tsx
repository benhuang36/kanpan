import { useStore } from "../store";
import StockCard from "./StockCard";

export default function DashboardGrid() {
  const watchlist = useStore((s) => s.watchlist);

  if (watchlist.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-[var(--color-muted)]">
        自選股是空的，先用搜尋框加入股票
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {watchlist.map((item) => (
          <StockCard key={item.stock_id} item={item} />
        ))}
      </div>
    </div>
  );
}
