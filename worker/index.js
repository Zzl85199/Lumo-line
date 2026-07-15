/**
 * Lumo・幫你顧 — 單一 Worker 後端
 *
 * 路由分流:
 *   POST /api/line/webhook  LINE Messaging API webhook(X-Line-Signature 簽章驗證)
 *   POST /api/inquiry       LIFF 諮詢表單送出(驗 LIFF access token → service role 寫入 → 推播管理員)
 *   GET  /api/plans         上架中的服務方案(官網方案區 + LIFF 下拉共用;anon key 讀取)
 *   其餘                    交給 ASSETS(static assets,SPA fallback 到 index.html)
 *
 * 機密一律走環境變數(wrangler secret / .dev.vars),不 hardcode。
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    try {
      if (url.pathname === '/api/line/webhook' && request.method === 'POST') {
        return await handleLineWebhook(request, env, ctx);
      }
      if (url.pathname === '/api/inquiry' && request.method === 'POST') {
        return await handleInquiry(request, env);
      }
      if (url.pathname === '/api/plans' && request.method === 'GET') {
        return await handleGetPlans(env);
      }
      if (url.pathname.startsWith('/api/')) {
        return json({ error: 'not_found' }, 404);
      }
      // 理論上 run_worker_first: ["/api/*"] 之外的請求不會進到這裡,
      // 但保險起見仍轉交 static assets。
      return env.ASSETS.fetch(request);
    } catch (err) {
      console.error('unhandled error:', err);
      return json({ error: 'internal_error' }, 500);
    }
  },
};

/* ═══════════════════════════════ LINE Webhook ═══════════════════════════════ */

async function handleLineWebhook(request, env, ctx) {
  // 1) 簽章驗證:必須用「原始 body 字串」做 HMAC-SHA256,再與 header 的 base64 比對。
  //    先讀 text 再 JSON.parse,不能先 parse(會動到原始位元組)。
  const bodyText = await request.text();
  const signature = request.headers.get('x-line-signature');
  const valid = await verifyLineSignature(bodyText, signature, env.LINE_CHANNEL_SECRET);
  if (!valid) {
    return json({ error: 'invalid_signature' }, 401);
  }

  let body;
  try {
    body = JSON.parse(bodyText);
  } catch {
    return json({ error: 'bad_request' }, 400);
  }

  // LINE Console 的「Verify」按鈕會送空 events 陣列,直接回 200 即可。
  const events = Array.isArray(body.events) ? body.events : [];

  // 事件處理放到背景做,先回 200 讓 LINE 平台不用等(官方建議盡快回應)。
  ctx.waitUntil(
    Promise.allSettled(events.map((ev) => handleLineEvent(ev, env))).then((results) => {
      for (const r of results) {
        if (r.status === 'rejected') console.error('event error:', r.reason);
      }
    })
  );

  return json({ ok: true });
}

/** X-Line-Signature 驗證:HMAC-SHA256(channel secret, raw body) 的 base64 */
async function verifyLineSignature(bodyText, signatureBase64, channelSecret) {
  if (!signatureBase64 || !channelSecret) return false;
  let sigBytes;
  try {
    sigBytes = base64ToBytes(signatureBase64);
  } catch {
    return false;
  }
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(channelSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );
  // crypto.subtle.verify 本身是恆定時間比較,避免 timing attack
  return crypto.subtle.verify('HMAC', key, sigBytes, enc.encode(bodyText));
}

async function handleLineEvent(event, env) {
  switch (event.type) {
    case 'follow':
      return replyMessages(env, event.replyToken, welcomeMessages());
    case 'message':
      if (event.message?.type === 'text') {
        const msgs = await buildKeywordReply(event.message.text, env);
        if (msgs) return replyMessages(env, event.replyToken, msgs);
      }
      return; // 非文字訊息或無匹配關鍵字時已在 buildKeywordReply 給預設回覆
    default:
      return; // unfollow 等事件不處理
  }
}

/* ── 訊息內容 ── */

function welcomeMessages() {
  return [
    {
      type: 'text',
      text:
        '嗨,歡迎加入 Lumo・幫你顧 👋\n\n' +
        '我們專門幫小型店家(補習班、美髮廳、餐飲、工作室)打理:\n' +
        '・LINE 自動回覆機器人\n' +
        '・LIFF 線上報名/諮詢系統\n' +
        '・圖文選單設計\n' +
        '・形象網站建置\n' +
        '・報名資料後台\n\n' +
        '直接輸入關鍵字就能查詢:\n' +
        '「方案」或「價格」→ 看服務方案\n' +
        '「諮詢」→ 預約免費諮詢\n' +
        '「案例」→ 了解服務對象與作品\n' +
        '「聯絡」→ 聯絡方式與服務時間',
    },
  ];
}

async function buildKeywordReply(text, env) {
  const t = (text || '').trim();

  if (t.includes('方案') || t.includes('價格')) {
    return plansMessages(env);
  }
  if (t.includes('諮詢') || t.includes('預約') || t.includes('報名')) {
    return [
      {
        type: 'text',
        text:
          '想進一步聊聊你的店需要什麼嗎?\n\n' +
          '請點下方選單的「預約諮詢」開啟線上表單,留下店家資訊與需求,' +
          '我們會在一個工作天內主動與你聯絡 😊',
      },
    ];
  }
  if (t.includes('案例')) {
    return [
      {
        type: 'text',
        text:
          'Lumo 服務過補習班、美髮廳、餐飲店與個人工作室,' +
          '常見的委託是:LINE 官方帳號自動回覆、線上報名表單、形象網站一條龍建置。\n\n' +
          '想看實際作品集嗎?直接在這裡留言「想看作品集」,我們會親自回覆你 📁',
      },
    ];
  }
  if (t.includes('聯絡')) {
    return [
      {
        type: 'text',
        text:
          'Lumo・幫你顧 聯絡方式\n\n' +
          '📞 電話:02-1234-5678\n' +
          '✉️ Email:hello@lumo.tw\n' +
          '🕘 服務時間:週一至週五 09:00–18:00\n\n' +
          '非服務時間留言,我們上班後會第一時間回覆!',
      },
    ];
  }

  // 無匹配 → 給提示,避免已讀不回
  return [
    {
      type: 'text',
      text:
        '收到!如果想快速查詢,可以輸入:\n' +
        '「方案」「價格」「諮詢」「案例」「聯絡」\n\n' +
        '或直接留言,我們會親自回覆你 🙂',
    },
  ];
}

/** 「方案/價格」→ 從 Supabase 撈上架中的方案組成回覆 */
async function plansMessages(env) {
  const plans = await fetchPublishedPlans(env);
  if (!plans.length) {
    return [
      { type: 'text', text: '目前方案調整中,請輸入「諮詢」預約,我們直接為你報價 🙂' },
    ];
  }
  const lines = plans.map((p) => {
    const price = p.show_price && p.price != null ? `NT$ ${Number(p.price).toLocaleString('zh-TW')} 起` : '加 LINE 詢價';
    return `▍${p.name}\n${p.tagline || ''}\n💰 ${price}`;
  });
  return [
    {
      type: 'text',
      text:
        'Lumo 目前的服務方案 👇\n\n' +
        lines.join('\n\n') +
        '\n\n想了解哪個方案適合你的店?輸入「諮詢」即可預約免費評估!',
    },
  ];
}

/* ── LINE Messaging API 呼叫 ── */

const LINE_API = 'https://api.line.me/v2/bot';

async function replyMessages(env, replyToken, messages) {
  if (!replyToken) return;
  const res = await fetch(`${LINE_API}/message/reply`, {
    method: 'POST',
    headers: lineHeaders(env),
    body: JSON.stringify({ replyToken, messages: messages.slice(0, 5) }),
  });
  if (!res.ok) console.error('LINE reply failed:', res.status, await res.text());
}

async function pushMessages(env, to, messages) {
  const res = await fetch(`${LINE_API}/message/push`, {
    method: 'POST',
    headers: lineHeaders(env),
    body: JSON.stringify({ to, messages: messages.slice(0, 5) }),
  });
  if (!res.ok) console.error('LINE push failed:', res.status, await res.text());
}

function lineHeaders(env) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`,
  };
}

/* ═══════════════════════════ /api/inquiry(LIFF 表單)═══════════════════════════ */

async function handleInquiry(request, env) {
  // 1) 取出前端 liff.getAccessToken() 送來的 access token
  const auth = request.headers.get('authorization') || '';
  const accessToken = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!accessToken) return json({ error: 'missing_token' }, 401);

  // 2) 官方建議的伺服器端驗證流程:
  //    GET /oauth2/v2.1/verify 確認 token 有效、client_id 吻合、未過期,
  //    再用 GET /v2/profile 由「伺服器端」取得 userId(不信任前端傳來的 userId)。
  const verifyRes = await fetch(
    `https://api.line.me/oauth2/v2.1/verify?access_token=${encodeURIComponent(accessToken)}`
  );
  if (!verifyRes.ok) return json({ error: 'invalid_token' }, 401);
  const verify = await verifyRes.json();
  if (String(verify.client_id) !== String(env.LIFF_CHANNEL_ID) || !(verify.expires_in > 0)) {
    return json({ error: 'token_channel_mismatch' }, 401);
  }

  const profileRes = await fetch('https://api.line.me/v2/profile', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!profileRes.ok) return json({ error: 'profile_fetch_failed' }, 401);
  const profile = await profileRes.json(); // { userId, displayName, ... }

  // 3) 解析並驗證表單欄位
  let form;
  try {
    form = await request.json();
  } catch {
    return json({ error: 'bad_json' }, 400);
  }
  const required = ['company_name', 'contact_name', 'phone'];
  for (const f of required) {
    if (!form[f] || !String(form[f]).trim()) {
      return json({ error: 'missing_field', field: f }, 400);
    }
  }

  const clip = (v, n = 500) => (v == null || v === '' ? null : String(v).slice(0, n));
  const row = {
    line_user_id: profile.userId,
    line_display_name: clip(profile.displayName, 100),
    company_name: clip(form.company_name, 100),
    contact_name: clip(form.contact_name, 100),
    phone: clip(form.phone, 50),
    email: clip(form.email, 200),
    plan_id: form.plan_id || null,
    industry: clip(form.industry, 50),
    budget_range: clip(form.budget_range, 50),
    launch_timeline: clip(form.launch_timeline, 50),
    existing_assets: clip(form.existing_assets, 50),
    preferred_contact_time: clip(form.preferred_contact_time, 50),
    message: clip(form.message, 2000),
    status: 'new',
  };

  // 4) service role 寫入 Supabase(RLS 對 anon 全關,只有 Worker 能寫)
  const insertRes = await fetch(`${env.SUPABASE_URL}/rest/v1/inquiries`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(row),
  });
  if (!insertRes.ok) {
    console.error('supabase insert failed:', insertRes.status, await insertRes.text());
    return json({ error: 'db_insert_failed' }, 502);
  }
  const [saved] = await insertRes.json();

  // 5) 推播通知管理員(推播失敗不影響表單成功,只記 log)
  if (env.ADMIN_LINE_USER_ID) {
    const notify =
      '📥 新諮詢單!\n\n' +
      `店家:${row.company_name}\n` +
      `聯絡人:${row.contact_name}(LINE:${row.line_display_name || '—'})\n` +
      `電話:${row.phone}\n` +
      (row.email ? `Email:${row.email}\n` : '') +
      (row.budget_range ? `預算:${row.budget_range}\n` : '') +
      (row.launch_timeline ? `希望上線:${row.launch_timeline}\n` : '') +
      (row.message ? `需求:${row.message.slice(0, 200)}\n` : '') +
      `\n單號:${saved?.id || '—'}`;
    try {
      await pushMessages(env, env.ADMIN_LINE_USER_ID, [{ type: 'text', text: notify }]);
    } catch (e) {
      console.error('admin push failed:', e);
    }
  }

  return json({ ok: true, id: saved?.id });
}

/* ═══════════════════════════ /api/plans(共用讀取)═══════════════════════════ */

async function handleGetPlans(env) {
  const plans = await fetchPublishedPlans(env);
  return json(
    { plans },
    200,
    { 'Cache-Control': 'public, max-age=60' } // 官網流量小,快取 60 秒即可
  );
}

/** anon key 讀取上架中的方案(RLS 只放行 is_published = true) */
async function fetchPublishedPlans(env) {
  const params = new URLSearchParams({
    select: 'id,name,tagline,features,price,show_price,sort_order',
    is_published: 'eq.true',
    order: 'sort_order.asc',
  });
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/service_plans?${params}`, {
    headers: {
      apikey: env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
    },
  });
  if (!res.ok) {
    console.error('supabase plans fetch failed:', res.status, await res.text());
    return [];
  }
  return res.json();
}

/* ═══════════════════════════════ 小工具 ═══════════════════════════════ */

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...extraHeaders },
  });
}

function base64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
