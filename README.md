# Lumo・幫你顧

單一 Cloudflare Worker 架構:Workers static assets 服務前端(Vite + React 建置到 `dist/`),
同一個 Worker(`worker/index.js`)處理 API,以 URL 路徑分流。

```
├── wrangler.jsonc          Cloudflare 設定(assets + run_worker_first + cron)
├── worker/index.js         後端:/api/line/webhook、/api/inquiry、/api/plans、scheduled(keepalive)
├── src/                    前端:/(官網首頁)、/liff(LIFF 諮詢表單)
├── supabase/schema.sql     資料表 + RLS + 種子資料
├── .env.example            前端建置時變數(VITE_LIFF_ID、VITE_LINE_ADD_FRIEND_URL)
└── .dev.vars.example       Worker 機密(本機開發用)
```

## API 一覽

| 路徑 | 方法 | 說明 |
|---|---|---|
| `/api/line/webhook` | POST | LINE webhook。**每個請求都做 X-Line-Signature HMAC-SHA256 簽章驗證**,處理 follow(歡迎訊息)與文字關鍵字(方案/價格/諮詢/預約/報名/案例/聯絡) |
| `/api/inquiry` | POST | LIFF 表單送出。伺服器端驗證 LIFF access token(`GET /oauth2/v2.1/verify` 比對 `client_id` 與 `LIFF_CHANNEL_ID`、確認未過期),再由伺服器端 `GET /v2/profile` 取得 userId(不信任前端),用 service role 寫入 `inquiries`,推播通知管理員 |
| `/api/plans` | GET | 上架中的服務方案(anon key + RLS),官網方案區與 LIFF 下拉共用 |

其餘路徑一律由 static assets 服務,`not_found_handling: "single-page-application"` 讓 `/liff` 等前端路由 fallback 到 `index.html`。

Worker 另外還有一個 **`scheduled`**(Cron Trigger)handler,每天固定對 Supabase 打一次查詢,純粹保活用,見第 7 節。

---

## 1. 安裝與本機開發

```bash
npm install

cp .env.example .env            # 填 VITE_LIFF_ID、VITE_LINE_ADD_FRIEND_URL
cp .dev.vars.example .dev.vars  # 填 Worker 機密(見檔內註解)

# 兩個終端機:
npm run dev:worker   # wrangler dev,API 跑在 :8787
npm run dev          # vite 跑在 :5173,/api/* 自動代理到 :8787
```

打開 http://localhost:5173 看官網。也可以 `npm run preview`(先 build 再由 wrangler 一站服務 :8787,最接近正式環境)。

本機測 webhook 需要對外網址,建議 `cloudflared tunnel --url http://localhost:8787` 或先部署後直接用正式網址測。

## 2. Supabase

1. 建立專案 → SQL Editor 貼上 `supabase/schema.sql` 整份執行(含三個方案的種子資料,價格自己改)。
2. Project Settings → API 取得:
   - **`SUPABASE_URL`(Project URL)**、`anon` key(只用來讀上架方案)
   - `service_role` key(**只放在 Worker secret,絕不進前端或版控**)

   ⚠️ **`SUPABASE_URL` 一定要換成真正的 project ref**(從 Supabase Dashboard 網址列或 Project Settings → API 複製),
   **絕對不能留著 `wrangler.jsonc` 裡預設的 `https://YOUR-PROJECT-REF.supabase.co` 沒改**——這個網域不存在,
   忘記改會導致 `/api/plans` 和 `/api/inquiry` 全部連不到資料庫,而且不會有明顯錯誤訊息提醒你,
   LIFF 表單送出時只會顯示籠統的失敗訊息,`inquiries` 表會一直是空的。**每個新客戶案部署前務必確認這行改對了。**

3. RLS 設計:
   - `service_plans`:anon 只能 SELECT 且 `is_published = true`
   - `inquiries`:啟用 RLS 且**不建任何政策** = anon 完全不可讀寫;只有 Worker 用 service role(繞過 RLS)寫入
4. 之後要改價格/上下架,直接在 Supabase Table Editor 改 `service_plans` 即可,官網、bot、LIFF 三處同步生效。

## 3. LINE 設定(LINE Developers Console)

### Messaging API channel(bot 用)
1. 建立 Provider → 建立 **Messaging API** channel(或由官方帳號後台啟用)。
2. 取得 **Channel secret**(→ `LINE_CHANNEL_SECRET`,在 **Basic settings** 分頁)與 **Channel access token**(→ `LINE_CHANNEL_ACCESS_TOKEN`,在 **Messaging API** 分頁)。
   ⚠️ 這兩個很容易搞混:Channel secret 用來驗簽章,Channel access token 用來發訊息,填反了 webhook 會一直 401。
3. Webhook URL 填:`https://<你的網域>/api/line/webhook`,開啟 Use webhook,按 Verify 應顯示 Success。
   - 如果 Verify 出現 **401 Unauthorized**,九成是 `LINE_CHANNEL_SECRET` 沒設或設錯,回 Cloudflare 改掉這條 secret 再重按 Verify。

### LINE Official Account Manager 的「回應設定」(這步最常被漏掉)
去 **manager.line.biz**(不是 Developers Console)→ 設定 → **回應設定(Response settings)**:

| 項目 | 要設成 | 為什麼 |
|---|---|---|
| **Chat** | **關閉** | 開著的話,凡是沒被關鍵字接住的訊息,LINE 會自動補一句「Unfortunately, this account isn't set up to reply directly to messages」跟你 bot 的回覆疊在一起 |
| **Webhooks** | **開啟** | 訊息才會送進你的 Worker |
| **加入好友的歡迎訊息 / Greeting message** | **關閉** | 交給你程式碼裡的 `follow` 事件處理,後台這份不關會兩邊各發一次,重複 |
| **自動回應訊息 / Auto-response messages** | **關閉** | 不關的話,LINE 官方罐頭回覆會攔截訊息,你的 webhook 完全收不到 |

**Chat 和 Webhooks 兩個開關不能同時開**,這是官方文件明講的限制,關掉 Chat 之後你就不能再用後台聊天畫面手動回客人,全部交給 Bot 處理(本專案的設計本來就是走全自動路線)。

### LIFF(表單用)
1. 同一個 Provider 下建立 **LINE Login** channel。
2. 該 channel → LIFF 分頁 → Add:
   - **Endpoint URL:`https://<你的網域>/liff`**(就是本專案的 SPA 路由)
   - Size:Tall 或 Full;Scope:勾 `profile`(表單會用 `liff.getProfile()`)
3. 建立後取得:
   - **LIFF ID**(格式 `1234567890-AbcdEfgh`)→ 填前端的 `VITE_LIFF_ID`
   - **LINE Login channel 的 Channel ID** → 填 Worker 的 `LIFF_CHANNEL_ID`(注意:是 channel ID,不是 LIFF ID;用來驗 access token 的 `client_id`)
4. LINE Login channel 記得把 bot 連結起來(Basic settings → Linked LINE Official Account),`liff.sendMessages` 才能把確認訊息送進與官方帳號的聊天室。

### 圖文選單(Rich Menu)
`worker/index.js` 回覆文字裡會提到「請點下方選單的『預約諮詢』」,但**選單本身不是程式碼生成的**,要在 LINE Official Account Manager 手動建立:

1. **manager.line.biz** → 首頁左側 **圖文選單(Rich menu)** → Create new
2. 上傳一張符合版型尺寸的圖(整張常見尺寸 2500×1686px),切分成幾格按鈕區塊
3. 每一格設定 Action:
   - 「預約諮詢」→ **Link** → `https://liff.line.me/<你的 LIFF_ID>`
   - 其他(方案/案例/聯絡等)→ **Text** → 直接送出對應關鍵字(如「方案」),會直接觸發 webhook 的關鍵字判斷,不用另外寫程式
4. 存檔後記得 **Set as default**,套用給所有使用者,不然選單不會顯示出來。

### 取得你自己的 ADMIN_LINE_USER_ID
最快的方法:先照上面流程把整個 bot + LIFF 表單跑通,自己拿手機測試送出一次 LIFF 表單,
然後去 Supabase Table Editor 的 `inquiries` 表,看剛剛那筆資料的 **`line_user_id`** 欄位
(格式 `U` 開頭 + 32 碼英數字),複製起來就是你的 userId。

備用方法:部署後加自己的官方帳號好友、隨便傳一句話,去 Cloudflare Worker → **Observability**(即時 log)
看 `event.source.userId`,或本機用 `npx wrangler tail`。

## 4. 推上 Git

```bash
git init
git add -A
git commit -m "Lumo site: worker + LINE bot + LIFF form"
git remote add origin <你的 repo URL>
git push -u origin main
```

`.gitignore` 已排除 `.env`、`.dev.vars`、`dist/`、`node_modules/`,金鑰不會進版控。

## 5. 部署到 Cloudflare Workers

> 本專案**不使用 Cloudflare Pages / functions/ 資料夾**(Pages 已不對新帳號開放建立),
> 一律用 Workers + static assets。部署有兩條路,擇一即可,**不要混用**:

### 方式 A:CLI 手動部署(適合單人快速上線)

```bash
npx wrangler login

# 設定機密(每條會互動式要你貼值,型別一律是 Secret)
npx wrangler secret put LINE_CHANNEL_SECRET
npx wrangler secret put LINE_CHANNEL_ACCESS_TOKEN
npx wrangler secret put LIFF_CHANNEL_ID
npx wrangler secret put ADMIN_LINE_USER_ID
npx wrangler secret put SUPABASE_ANON_KEY
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY

# SUPABASE_URL 不是機密,直接改 wrangler.jsonc 的 vars(記得換成真的 project ref!)
# VITE_ 開頭的變數要放 .env,本機 build 時打包進前端

npm run deploy   # = vite build + wrangler deploy
```

### 方式 B:Cloudflare Dashboard 連 GitHub,push 就自動部署

Dashboard → Workers & Pages → Create → 連結 Git repo,Build command 填 `npm run build`,
Deploy command 填 `npx wrangler deploy`。

⚠️ 這條路徑下,環境變數要在 **同一個 Worker 的 Settings 裡兩個獨立分頁**分別設定,**很容易搞混**:

| 分頁位置 | 用途 | 要放什麼 |
|---|---|---|
| **Settings → Build → Variables and secrets** | 建置期(Vite `npm run build` 打包網頁時讀的) | `VITE_LIFF_ID`、`VITE_LINE_ADD_FRIEND_URL`(型別選 Plaintext/Variable,反正最後就是公開的) |
| **Settings → Runtime → Variables and secrets** | 執行期(Worker 後端程式碼跑的時候讀的) | `LINE_CHANNEL_SECRET`、`LINE_CHANNEL_ACCESS_TOKEN`、`LIFF_CHANNEL_ID`、`ADMIN_LINE_USER_ID`、`SUPABASE_ANON_KEY`、`SUPABASE_SERVICE_ROLE_KEY`(型別選 Secret) |

放錯分頁最常見的症狀:`VITE_LIFF_ID` 誤放到 Runtime → 前端拿到的值永遠是 `undefined`,LIFF 頁面打不開,
錯誤訊息會顯示「尚未設定 VITE_LIFF_ID」。

**改了 Build 那邊的變數之後,一定要手動觸發一次新的 build 才會生效**(改設定本身不會自動重跑 build):
去 **Deployments** 分頁按 **Retry deployment**,或推一個新 commit(哪怕是空 commit)。
判斷有沒有真的重新 build 過,看 Deployments/Version History 裡那筆是不是**帶 `main` 分支標籤、來自 GitHub push**,
而不是單純 `by Dashboard` 的設定快照(那種只更新設定值,不會重新 build)。

---

部署後會拿到 `https://lumo-site.<帳號>.workers.dev`(可再綁自訂網域:Workers → Settings → Domains & Routes)。
**Worker 實際名稱以 `wrangler.jsonc` 的 `name` 為準,跟 Dashboard 建立精靈裡填的「Project name」是兩件事**,不要被搞混。
拿到網址後回頭把:LINE webhook URL、LIFF Endpoint URL 換成正式網域。

`wrangler.jsonc` 關鍵設定(已寫好):

```jsonc
"assets": {
  "directory": "dist",
  "binding": "ASSETS",
  "not_found_handling": "single-page-application",
  "run_worker_first": ["/api/*"]   // 只有 /api/* 進 Worker,其餘直接吃靜態資產
},
"triggers": {
  "crons": ["0 3 * * *"]           // 每天保活 ping 一次 Supabase,見第 7 節
}
```

## 6. 上線檢查清單

- [ ] `wrangler.jsonc` 的 `SUPABASE_URL` 已換成真正的 project ref,不是 `YOUR-PROJECT-REF` 預留值
- [ ] `curl https://<網域>/api/plans` 回得出三個方案
- [ ] LINE Console 按 Verify → Success(代表簽章驗證與路由都通)
- [ ] LINE Official Account Manager → 回應設定:Chat 關、Webhooks 開、歡迎訊息關、自動回應關
- [ ] 加好友收到歡迎訊息(只有一次,沒有跟後台歡迎訊息重複);輸入「價格」回 Supabase 的方案;輸入「預約」被導向諮詢
- [ ] 圖文選單「預約諮詢」已建立、已設為 default,點下去能正常開啟 LIFF 表單(不是 400 或 VITE_LIFF_ID 未設定的錯誤)
- [ ] 從圖文選單開 LIFF 表單 → 送出 → Supabase `inquiries` 多一筆、你的 LINE 收到推播
- [ ] 外部瀏覽器直接開 `https://<網域>/liff` 會先跳 LINE Login(正常行為)
- [ ] Cloudflare Worker → Triggers 分頁看得到 Cron Trigger `0 3 * * *`
- [ ] Secrets 六條(`LINE_CHANNEL_SECRET`、`LINE_CHANNEL_ACCESS_TOKEN`、`LIFF_CHANNEL_ID`、`ADMIN_LINE_USER_ID`、`SUPABASE_ANON_KEY`、`SUPABASE_SERVICE_ROLE_KEY`)都在 Worker 的 **Runtime** 設定裡看得到,`VITE_` 開頭的兩條在 **Build** 設定裡看得到

## 7. Supabase 保活(Free 專案會自動暫停)

Supabase Free 專案「一週沒有流量會自動暫停」,暫停後 `/api/plans`(bot 撈方案)與 `/api/inquiry`(LIFF 表單寫入)
都會失敗,而且不會有明顯提醒,客戶端很可能先發現。

本專案已內建解法:`wrangler.jsonc` 設了 Cron Trigger(`0 3 * * *`,每天 UTC 3:00 = 台灣 11:00),
搭配 `worker/index.js` 的 `scheduled` handler,每天自動對 Supabase 打一次真正的查詢保持活躍,免費、不用額外服務、
新客戶案複製這份樣板就自動生效,不用每次重設。

部署後可到 Cloudflare Dashboard → Worker → **Triggers** 分頁確認排程已生效,也能手動觸發測試一次。

商業上仍建議:報價單清楚寫「資料庫方案:Free(需搭配保活機制,仍有極端情況風險)/ Pro(無休眠,US$25/月起)」,
讓客戶自己選,正式簽約上線的案子不管客戶選哪個方案都建議保留這個 Cron keepalive 當保底。

## 已知限制與誠實聲明

- `liff.sendMessages()` 只有在 **LINE App 內、從與官方帳號的聊天室開啟** LIFF 時可用;外部瀏覽器開啟會失敗,程式已 try/catch 並提示,不影響表單送出。
- 官網上的電話/Email/地圖是佔位內容,請自行替換(地圖在 `Home.jsx` 有 TODO 註解)。
- LINE/LIFF 呼叫皆採官方目前文件寫法:webhook 簽章 = channel secret 對 raw body 做 HMAC-SHA256 後 base64、回覆/推播走 `api.line.me/v2/bot/message/{reply,push}`、LIFF token 伺服器端驗證走 `GET /oauth2/v2.1/verify` + `GET /v2/profile`。若日後官方改版,以 developers.line.biz 為準。
- Cron Trigger 的保活 ping 只解決「太久沒流量被暫停」,不代表可以完全取代 Pro 方案的效能/容量/備份保證,大流量客戶仍建議升級。
