# 接案 SOP — LINE chatbot + 網站(Cloudflare Workers 版)

> 更新重點：技術棧從 Cloudflare **Pages / Pages Functions** 改為 Cloudflare **Workers（static assets）**。
> Cloudflare 已停止對新帳號開放建立 Pages 專案，照舊版 SOP 產出會卡在「找不到 Pages 建立入口」。

---

## 0. 主 prompt（固定技術棧）

```
我在幫一個小型企業做 LINE chatbot + 網站的接案專案,請照以下固定技術棧產出程式:

- 前端 + 後端:Vite + React,部署到 Cloudflare Workers
  (用 Workers static assets 服務前端 dist,同一個 Worker 處理 API)
- 專案結構:前端建置輸出到 dist/;Worker 進入點放 worker/index.js;根目錄放 wrangler.jsonc
- LINE webhook 與表單後端:都寫在 worker/index.js 裡,用 URL 路徑分流
  (/api/line/webhook、/api/inquiry)
- 資料庫:Supabase(Postgres)
- LINE 內表單:LIFF 頁面(React,放在同一個專案的 /liff 路由,靠 SPA fallback)

規則:
1. 所有金鑰用環境變數讀取,絕不 hardcode。
2. LINE webhook 一定要做 X-Line-Signature 簽章驗證。
3. LINE / LIFF 的 API 用法請採用官方最新寫法,若不確定就明講,不要亂編欄位。
4. 程式碼要能直接跑,附上必要的設定與安裝說明。
5. Cloudflare 設定用 wrangler.jsonc:assets.directory 指向 dist、加 binding "ASSETS"、
   not_found_handling: "single-page-application",並用 run_worker_first: ["/api/*"]
   讓 API 走 Worker、其餘走靜態資產。不要用 Cloudflare Pages 或 functions/ 資料夾
   (Pages 已停止對新帳號開放建立)。

客戶背景:[業別,例:國中小補習班]
需要的功能:[列點,例:加好友自動介紹、圖文選單、LIFF 線上報名、報名資料存進資料庫]
```

---

## 2-1. 建立專案骨架

```
請幫我建立這個專案的初始結構(Vite + React + Cloudflare Workers static assets):
- 形象網站首頁(單頁即可,含:店名、簡介、課程/服務、聯絡方式、加 LINE 好友按鈕)
- /liff 路由的空白頁(之後放表單)
- worker/index.js 的 Worker 骨架,含路徑路由:
  /api/line/webhook 做簽章驗證、先只回覆固定訊息;其餘路徑回傳 env.ASSETS.fetch(request)
- package.json、vite 設定、wrangler.jsonc(assets 指向 dist、run_worker_first: ["/api/*"]、
  not_found_handling: "single-page-application")
- 一份 .env.example 列出需要的環境變數名稱
請一併說明本機怎麼跑(vite dev 與 wrangler dev)、怎麼推到 Git、
Cloudflare 要怎麼設定(build command: npm run build、deploy: npx wrangler deploy,
前端 VITE_* 設在 build 環境變數、後端金鑰設在 runtime Secret)。
```

---

## 2-2. LINE webhook 邏輯

```
請擴充 worker/index.js 裡的 webhook 處理函式:
- 處理 follow(加好友)事件:回覆歡迎訊息與服務簡介
- 處理 message 事件:依關鍵字回覆(關鍵字與回覆內容見下)
- 需要動態資料的回覆改用 Supabase 查詢
關鍵字對照:
[例:
「報名」→ 回覆一段文字 + LIFF 報名連結
「課表」→ 從 Supabase 撈本週課表回覆
「聯絡」→ 回覆電話與地址
]
維持簽章驗證,金鑰用環境變數。
```

---

## 2-3. LIFF 表單(進階型才需要)

```
請做一個 LIFF 報名/預約表單(React,放在 /liff 路由):
- 用 LIFF SDK 初始化,取得使用者的 LINE displayName 與 userId
- 表單欄位:[例:姓名、電話、想報名的課程(下拉)、備註]
- 送出時打 POST /api/inquiry,由 worker/index.js 驗證 LIFF access token 後,
  以 service_role 寫入 Supabase 的 [資料表名](前端不要直接用 service role key)
- 送出成功顯示完成畫面,並可選擇用 liff.sendMessages 回傳一則確認訊息到聊天室
請說明 LIFF ID 要設在哪、Endpoint URL 要怎麼填(指向 https://<網域>/liff)。
```

---

## 2-4. Supabase 資料表設計

```
這個客戶([業別])需要用到的資料,請幫我設計 Supabase(Postgres)資料表:
需求:[例:記錄報名(學員姓名、電話、課程、LINE userId、報名時間、狀態)、課程清單、繳費紀錄]
請提供:
- 建立資料表的 SQL(含主鍵、外鍵、預設值、時間戳)
- 建議的 Row Level Security 政策
- 給前端用的 anon key 與給 worker 用的 service role key 分別該怎麼用
  (anon 受 RLS 限制只讀公開資料;service role 只在 Worker 後端使用,繞過 RLS,絕不進前端)
```

---

## 2-5. 形象網站頁面(可選,要更漂亮時)

```
請把形象網站首頁做得更完整、行動裝置優先(RWD):
店家資訊:[店名、標語、3~5 項服務/課程、營業時間、地址、電話]
風格:[例:明亮清爽、以品牌色 #xxxxxx 為主]
需要:加 LINE 好友的按鈕(連結 [LINE 好友網址])、Google Maps 嵌入、聯絡區塊。
純前端即可,不要用瀏覽器 storage。
```

---

## 檢查點

- 本機能跑起來(`npm run dev` 開前端;`wrangler dev` 測 API）。
- webhook 骨架會做 X-Line-Signature 簽章驗證。
- `wrangler.jsonc` 已設定 `run_worker_first: ["/api/*"]` 與 `not_found_handling: "single-page-application"`。
- （進階型）LIFF 頁面與 Supabase schema 都產出了。
- 所有 LINE/LIFF 程式已對照官方文件確認一次。
- 沒有用到 `functions/` 資料夾或 Cloudflare Pages。
