# KanPan 看盤

A cross-platform desktop dashboard for the **Taiwan stock market (台股)**, built with [Tauri](https://tauri.app) (Rust) + React + TypeScript.

Search stocks, build a watch list, and view price, moving averages, technical indicators, institutional flows, valuation and (with a Fugle key) realtime quotes — plus optional AI-assisted analysis.

> ⚠️ 本工具僅供教育與研究參考，**非投資建議**。指標與 AI 分析可能有誤或過時，請自行查證。

## Features

- **搜尋自選股**：用代號或名稱搜尋（FinMind 全清單，本地快取）
- **單檔聚焦**：日K / 分K 圖、MA5/20/60/200、日/週/月漲幅
- **技術指標**：RSI、KD、MACD（含判讀）
- **籌碼 / 估值**：三大法人買賣超、融資融券、PER / PBR / 殖利率
- **即時報價**：Fugle WebSocket 即時價 + 內外盤五檔（需金鑰、限盤中）
- **盤中分K**：Fugle 1/5/15/60 分鐘線
- **多檔檢視**：卡片總覽、可排序列表、相對表現比較疊圖
- **警示通知**：價格 / 漲跌幅 / RSI 條件觸發桌面通知
- **AI 分析**：將個股數據送至 OpenAI 相容 endpoint 產生教育性分析
- **ⓘ 說明**：各指標附白話 tooltip

## Data sources

| 用途 | 來源 |
|---|---|
| 歷史價、均線、漲幅、三大法人、融資融券、PER/PBR/殖利率 | [FinMind](https://finmindtrade.com)（免金鑰可用） |
| 即時報價、內外盤五檔、盤中分K | [Fugle](https://developer.fugle.tw)（需自行申請 API key） |

## Getting started

需求：[Rust](https://rustup.rs) 與 [Node.js](https://nodejs.org) (18+)。

```bash
npm install
npm run tauri dev      # 開發模式
npm run tauri build    # 打包成桌面 app
```

## Configuration

開啟 app 後在右上「設定」填入（皆只存於本機，不進版控）：

- **FinMind token**（選填）：提升免費額度
- **Fugle API key**：啟用即時報價 / 內外盤 / 分K
- **AI endpoint + model + key**：OpenAI 相容服務（含本地 LM Studio / Ollama）

## License

[MIT](LICENSE) © 2026 Ben Huang
