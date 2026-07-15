/**
 * 諮詢表單後端 — POST /api/inquiry
 *
 * 流程:
 *   1. 驗證前端送來的 LIFF access token(官方端點 /oauth2/v2.1/verify,
 *      並比對 client_id 是否為自己的 LINE Login channel,防止拿別家 token 冒用)
 *   2. 用該 token 呼叫 /v2/profile 取得「伺服器端可信」的 userId / displayName
 *   3. 以 service_role 寫入 Supabase inquiries
 *   4. 推播(push)一則新諮詢通知給管理員
 *
 * 環境變數:
 *   LINE_LOGIN_CHANNEL_ID   — LINE Login channel 的 Channel ID(LIFF 掛的那個)
 *   LINE_CHANNEL_ACCESS_TOKEN — Messaging API channel token(推播用)
 *   ADMIN_LINE_USER_ID      — 要收通知的你的 LINE userId(對 bot 輸入「我的ID」取得)
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

const OPTIONAL_FIELDS = ['email', 'industry', 'budget_range', 'timeline', 'existing_assets', 'contact_time', 'note'];

export async function onRequestPost(context) {
  const { request, env } = context;

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'bad request' }, 400);
  }

  const { accessToken, form } = payload || {};
  if (!accessToken || !form) return json({ error: 'missing fields' }, 400);

  // ---- 必填欄位基本驗證(後端為準,不信任前端) ----
  const companyName = clean(form.company_name, 100);
  const contactName = clean(form.contact_name, 50);
  const phone = clean(form.phone, 20);
  if (!companyName || !contactName || !phone || phone.length < 8) {
    return json({ error: '請填寫店家名稱、聯絡人與正確電話' }, 400);
  }

  // ---- 1) 驗證 LIFF access token ----
  const verifyRes = await fetch(
    `https://api.line.me/oauth2/v2.1/verify?access_token=${encodeURIComponent(accessToken)}`
  );
  if (!verifyRes.ok) return json({ error: 'token 驗證失敗,請重新開啟表單' }, 401);
  const verify = await verifyRes.json(); // { scope, client_id, expires_in }
  if (
    String(verify.client_id) !== String(env.LINE_LOGIN_CHANNEL_ID) ||
    !(verify.expires_in > 0)
  ) {
    return json({ error: 'token 無效,請重新開啟表單' }, 401);
  }

  // ---- 2) 取得可信的使用者資料 ----
  const profileRes = await fetch('https://api.line.me/v2/profile', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!profileRes.ok) return json({ error: '無法取得使用者資料' }, 401);
  const profile = await profileRes.json(); // { userId, displayName, ... }

  // ---- 3) 寫入 Supabase(service_role) ----
  const row = {
    line_user_id: profile.userId,
    display_name: profile.displayName ?? null,
    company_name: companyName,
    contact_name: contactName,
    phone,
    service_id: form.service_id || null,
  };
  for (const key of OPTIONAL_FIELDS) {
    row[key] = clean(form[key], key === 'note' ? 1000 : 100) || null;
  }

  const insertRes = await fetch(`${env.SUPABASE_URL}/rest/v1/inquiries`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(row),
  });
  if (!insertRes.ok) {
    console.error('insert inquiry failed:', insertRes.status, await insertRes.text());
    return json({ error: '系統忙碌,請稍後再試' }, 500);
  }

  // ---- 4) 推播通知管理員(失敗不影響表單結果) ----
  context.waitUntil(notifyAdmin(env, row, form.service_name));

  return json({ ok: true });
}

export async function onRequest(context) {
  if (context.request.method === 'POST') return onRequestPost(context);
  return new Response('Method Not Allowed', { status: 405 });
}

async function notifyAdmin(env, row, serviceName) {
  if (!env.ADMIN_LINE_USER_ID || !env.LINE_CHANNEL_ACCESS_TOKEN) return;
  const lines = [
    '🔔 新諮詢單!',
    `店家:${row.company_name}`,
    `聯絡人:${row.contact_name}(LINE:${row.display_name || '—'})`,
    `電話:${row.phone}`,
    serviceName ? `想了解:${serviceName}` : null,
    row.budget_range ? `預算:${row.budget_range}` : null,
    row.timeline ? `上線時間:${row.timeline}` : null,
    row.contact_time ? `方便聯絡:${row.contact_time}` : null,
    row.note ? `需求:${row.note}` : null,
  ].filter(Boolean);

  try {
    const res = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        to: env.ADMIN_LINE_USER_ID,
        messages: [{ type: 'text', text: lines.join('\n') }],
      }),
    });
    if (!res.ok) console.error('notifyAdmin failed:', res.status, await res.text());
  } catch (err) {
    console.error('notifyAdmin error:', err);
  }
}

function clean(v, max) {
  if (typeof v !== 'string') return '';
  return v.trim().slice(0, max);
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
