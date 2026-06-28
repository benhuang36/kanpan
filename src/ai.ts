import type { RealtimeQuote, StockDetail } from "./types";

export const AI_SYSTEM_PROMPT = `你是協助分析台股的助理。根據使用者提供的個股技術面、籌碼面、估值數據，用繁體中文做客觀、教育性質的分析。

請包含：
1. 目前多空狀況（價格相對均線、動能指標）。
2. 籌碼面觀察（三大法人、融資融券）。
3. 估值是否偏高或合理。
4. 需要注意的風險與關鍵訊號。

若標的為 ETF：
- 請依你已知的資訊，列出該 ETF 的追蹤指數與主要成分股（前幾大持股）及產業權重，並評估「集中度風險」（是否過度集中於單一個股或產業）。
- 以追蹤指數、成分分散、配息、折溢價、費用率的角度分析，不要套用個股的 EPS／本益比等公司基本面框架（ETF 的 PER/PBR 參考意義有限）。
- 成分與權重屬你的既有知識、可能已過時，務必提醒使用者以發行商最新公告為準。若你不確定該 ETF 的成分，請明說，不要捏造。

請平衡呈現正反面，務必不要給出保證獲利、目標價或明確的「買進/賣出」指令。資料可能延遲或不完整，若資訊不足請明說。最後務必加上一行：「本分析僅供教育參考，非投資建議。」`;

function lastNonNull(values: (number | null)[]): number | null {
  for (let i = values.length - 1; i >= 0; i--) if (values[i] != null) return values[i];
  return null;
}

const lots = (shares: number) => Math.round(shares / 1000);
const bias = (p: number, ma: number | null) =>
  ma ? `${(((p - ma) / ma) * 100).toFixed(1)}%` : "—";
const f = (v: number | null | undefined, d = 2) => (v == null ? "—" : v.toFixed(d));

/** Compose a compact, readable metrics block for the LLM. */
export function buildAnalysisPrompt(detail: StockDetail, rt?: RealtimeQuote): string {
  const s = detail.summary;
  const live = rt && rt.last_price > 0;
  const price = live ? rt!.last_price : s.close;
  const changePct = live && s.prev_close ? ((rt!.last_price - s.prev_close) / s.prev_close) * 100 : s.change_pct;

  const rsi = lastNonNull(detail.indicators.rsi14);
  const k = lastNonNull(detail.indicators.k);
  const d = lastNonNull(detail.indicators.d);
  const macd = lastNonNull(detail.indicators.macd_hist);

  const inst = detail.institutional.at(-1);
  const inst5 = detail.institutional.slice(-5).reduce((a, x) => a + x.total_net, 0);
  const m = detail.margin.at(-1);
  const v = detail.valuation;

  const kind = s.is_etf ? "ETF" : `個股（產業：${s.industry_category || "未分類"}）`;

  return [
    `標的：${s.stock_name} (${s.stock_id})　類型：${kind}　資料日：${s.date}${live ? "（含即時價）" : ""}`,
    `價格：${f(price)}　漲跌：${f(changePct)}%　週：${f(s.week_change_pct)}%　月：${f(s.month_change_pct)}%`,
    `均線：MA5 ${f(s.ma5)} (乖離 ${bias(price, s.ma5)})、MA20 ${f(s.ma20)} (${bias(price, s.ma20)})、MA60 ${f(s.ma60)} (${bias(price, s.ma60)})、MA200 ${f(s.ma200)} (${bias(price, s.ma200)})`,
    `技術指標：RSI14 ${f(rsi, 1)}、K ${f(k, 1)}/D ${f(d, 1)}、MACD柱 ${f(macd)}`,
    inst
      ? `三大法人(張)：外資 ${lots(inst.foreign_net)}、投信 ${lots(inst.trust_net)}、自營商 ${lots(inst.dealer_net)}、合計 ${lots(inst.total_net)}；近5日合計 ${lots(inst5)}`
      : "三大法人：無資料",
    m
      ? `融資餘額 ${Math.round(m.margin_balance)} 張(日增減 ${Math.round(m.margin_change)})、融券餘額 ${Math.round(m.short_balance)} 張(日增減 ${Math.round(m.short_change)})`
      : "融資融券：無資料",
    v ? `估值：PER ${f(v.per)}、PBR ${f(v.pbr)}、殖利率 ${f(v.dividend_yield)}%` : "估值：無資料",
    "",
    "請依上述數據做分析。",
  ].join("\n");
}
