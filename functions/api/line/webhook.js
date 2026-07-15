/**
 * LINE Messaging API Webhook — Cloudflare Pages Function
 * 路徑:/api/line/webhook
 *
 * 依官方文件實作(developers.line.biz):
 * - 簽章驗證:以 channel secret 為 key,對「原始 request body」做 HMAC-SHA256,
 *   base64 後與 x-line-signature 標頭比對。務必先驗簽再處理事件。
 * - 回覆:POST https://api.line.me/v2/bot/message/reply(Bearer channel access token)
 *
 * 環境變數(Cloudflare Pages > Settings > Environment variables):
 *   LINE_CHANNEL_SECRET, LINE_CHANNEL_ACCESS_TOKEN,
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

// ---------- 關鍵字對照表(改文案只需要動這一區) ----------
// value 可以是字串(固定回覆),或 async function (env) => 訊息陣列(動態資料)
const KEYWORD_REPLIES = {
  方案: async (env) => [{ type: 'text', text: await buildServiceListText(env) }],
  價格: async (env) => [{ type: 'text', text: await buildServiceListText(env) }],
  諮詢: () => [
    {
      type: 'text',
      text: '預約免費諮詢請點選單的「預約諮詢」開啟表單,約 1 分鐘填完,我們會盡快與您聯絡!',
    },
  ],
  案例: '我們專為小型店家(補習班、餐飲、美容等)建置 LINE 機器人與形象網站。實際案例與作品集歡迎留言索取,小編會親自介紹 😊',
  聯絡: '電話:02-1234-5678\nEmail:hello@lumo.example\n服務時間:週一至週五 09:00–18:00\n也可以直接在這裡留言,我們會盡快回覆您!',
};

const FALLBACK_TEXT =
  '您好!我是 Lumo 小幫手 🤖\n輸入「方案」看服務方案與價格、「諮詢」預約免費諮詢,或「聯絡」查看聯絡方式。';

const WELCOME_TEXT =
  '歡迎加入 Lumo 幫你顧 🎉\n我們專為小型店家打造 LINE 機器人與形象網站,\n讓您顧好本業,數位交給我們。\n\n您可以:\n・輸入「方案」查看服務方案\n・輸入「諮詢」預約免費諮詢\n・點下方選單快速操作\n\n有任何問題都歡迎直接留言!';

// ---------------------------------------------------------------------------

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.LINE_CHANNEL_SECRET || !env.LINE_CHANNEL_ACCESS_TOKEN) {
    console.error('Missing LINE env vars');
    return new Response('Server not configured', { status: 500 });
  }

  // 1) 一定要用「原始字串」驗簽,不能先 JSON.parse 再 stringify(會驗不過)
  const bodyText = await request.text();
  const signature = request.headers.get('x-line-signature');

  const valid =
    signature && (await verifyLineSignature(env.LINE_CHANNEL_SECRET, bodyText, signature));
  if (!valid) {
    return new Response('Invalid signature', { status: 401 });
  }

  let body;
  try {
    body = JSON.parse(bodyText);
  } catch {
    return new Response('Bad request', { status: 400 });
  }

  const events = Array.isArray(body.events) ? body.events : [];

  // 2) 官方建議儘快回 200,事件用非同步處理(waitUntil 讓回應後繼續執行)
  context.waitUntil(
    Promise.allSettled(events.map((event) => handleEvent(event, env))).then((results) => {
      for (const r of results) {
        if (r.status === 'rejected') console.error('event error:', r.reason);
      }
    })
  );

  return new Response('OK', { status: 200 });
}

// 其他 method 一律 405(LINE 平台只會用 POST;Verify 按鈕也是 POST)
export async function onRequest(context) {
  if (context.request.method === 'POST') return onRequestPost(context);
  return new Response('Method Not Allowed', { status: 405 });
}

// ---------- 簽章驗證(Web Crypto,Workers 執行環境原生支援) ----------

async function verifyLineSignature(channelSecret, bodyText, signature) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(channelSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const mac = await crypto.subtle.sign('HMAC', key, enc.encode(bodyText));
  const expected = base64FromBytes(new Uint8Array(mac));
  return timingSafeEqual(expected, signature);
}

function base64FromBytes(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

// 常數時間比對,避免 timing attack
function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ab = new TextEncoder().encode(a);
  const bb = new TextEncoder().encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

// ---------- 事件處理 ----------

async function handleEvent(event, env) {
  switch (event.type) {
    case 'follow':
      // 加好友(或解除封鎖)→ 歡迎訊息
      return replyMessage(env, event.replyToken, [{ type: 'text', text: WELCOME_TEXT }]);

    case 'message':
      if (event.message?.type === 'text') {
        return handleTextMessage(event, env);
      }
      // 貼圖、圖片等其他訊息型別:給個溫和的引導
      return replyMessage(env, event.replyToken, [
        { type: 'text', text: '收到!想看服務內容輸入「方案」,想預約輸入「諮詢」就可以囉 😊' },
      ]);

    default:
      // unfollow、join 等事件沒有 replyToken 或暫不處理
      return;
  }
}

async function handleTextMessage(event, env) {
  const text = (event.message.text || '').trim();

  // 管理員小工具:取得自己的 userId(設定 ADMIN_LINE_USER_ID 用,設定完可移除)
  if (text === '我的ID') {
    return replyMessage(env, event.replyToken, [
      { type: 'text', text: `您的 LINE userId:\n${event.source?.userId || '取不到'}` },
    ]);
  }

  // 同義詞正規化:預約/報名 都視為 諮詢
  const normalized = text.replace(/預約|報名/g, '諮詢');

  for (const [keyword, replier] of Object.entries(KEYWORD_REPLIES)) {
    if (normalized.includes(keyword)) {
      const messages =
        typeof replier === 'function'
          ? await replier(env)
          : [{ type: 'text', text: replier }];
      return replyMessage(env, event.replyToken, messages);
    }
  }

  return replyMessage(env, event.replyToken, [{ type: 'text', text: FALLBACK_TEXT }]);
}

// ---------- Supabase 動態查詢:服務方案(service_role,只在後端使用) ----------

async function buildServiceListText(env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return '方案資訊維護中,請稍後再試,或直接留言詢問 🙏';
  }
  try {
    const url =
      `${env.SUPABASE_URL}/rest/v1/services` +
      `?select=name,tagline,price,show_price&is_active=eq.true&order=sort_order.asc&limit=10`;
    const res = await fetch(url, {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    });
    if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
    const services = await res.json();
    if (!services.length) return '方案內容調整中,歡迎留言詢問!';

    const lines = services.map((sv) => {
      const price =
        sv.show_price && sv.price != null
          ? `NT$ ${Number(sv.price).toLocaleString()} 起`
          : '加 LINE 詢價';
      return `✨ ${sv.name}\n${sv.tagline || ''}\n💰 ${price}`.trim();
    });
    return `目前的服務方案:\n\n${lines.join('\n\n')}\n\n輸入「諮詢」即可預約免費諮詢!`;
  } catch (err) {
    console.error('buildServiceListText:', err);
    return '方案資訊暫時讀取不到,請稍後再試 🙏';
  }
}

// ---------- 回覆訊息(Messaging API reply endpoint) ----------

async function replyMessage(env, replyToken, messages) {
  if (!replyToken) return;
  const res = await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({ replyToken, messages }),
  });
  if (!res.ok) {
    console.error('LINE reply failed:', res.status, await res.text());
  }
}
