import { useEffect, useState } from 'react';
import liff from '@line/liff';

const LIFF_ID = import.meta.env.VITE_LIFF_ID;

const INDUSTRIES = ['補習班/教育', '美髮/美容', '餐飲', '個人工作室', '零售', '其他'];
const BUDGETS = ['1 萬以下', '1–3 萬', '3–6 萬', '6–10 萬', '10 萬以上', '還不確定'];
const TIMELINES = ['一個月內', '1–3 個月', '3 個月以上', '還在評估'];
const ASSETS = ['都還沒有', '已有 LINE 官方帳號', '已有網站', '兩者都有'];
const CONTACT_TIMES = ['平日上午', '平日下午', '平日晚上', '假日', '都可以'];

const EMPTY_FORM = {
  company_name: '',
  contact_name: '',
  phone: '',
  plan_id: '',
  email: '',
  industry: '',
  budget_range: '',
  launch_timeline: '',
  existing_assets: '',
  preferred_contact_time: '',
  message: '',
};

export default function LiffForm() {
  const [phase, setPhase] = useState('init'); // init | ready | submitting | done | error
  const [error, setError] = useState('');
  const [profile, setProfile] = useState(null);
  const [plans, setPlans] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [confirmSent, setConfirmSent] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        if (!LIFF_ID) throw new Error('尚未設定 VITE_LIFF_ID(見 .env.example)');
        await liff.init({ liffId: LIFF_ID });
        if (!liff.isLoggedIn()) {
          // 外部瀏覽器開啟時需要先登入;LINE App 內開啟會自動登入
          liff.login({ redirectUri: window.location.href });
          return;
        }
        const p = await liff.getProfile(); // 需要 profile scope
        setProfile(p);
        setPhase('ready');
      } catch (e) {
        console.error(e);
        setError(e.message || 'LIFF 初始化失敗');
        setPhase('error');
      }
    })();

    fetch('/api/plans')
      .then((r) => (r.ok ? r.json() : { plans: [] }))
      .then((d) => setPlans(d.plans || []))
      .catch(() => setPlans([]));
  }, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (!form.company_name.trim() || !form.contact_name.trim() || !form.phone.trim()) {
      setError('請填寫必填欄位:店家/公司名稱、聯絡人、聯絡電話');
      return;
    }
    setPhase('submitting');
    try {
      const token = liff.getAccessToken();
      if (!token) throw new Error('取不到登入憑證,請重新開啟表單');
      const res = await fetch('/api/inquiry', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ ...form, plan_id: form.plan_id || null }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error === 'missing_field' ? '有必填欄位沒填到' : '送出失敗,請稍後再試');
      }
      setPhase('done');
    } catch (e2) {
      console.error(e2);
      setError(e2.message);
      setPhase('ready');
    }
  }

  /** 選擇性:把確認訊息傳回自己與官方帳號的聊天室(僅 LINE App 內開啟時可用) */
  async function sendConfirm() {
    try {
      await liff.sendMessages([
        { type: 'text', text: `我已送出諮詢表單(${form.company_name}),再麻煩與我聯絡,謝謝!` },
      ]);
      setConfirmSent(true);
    } catch (e) {
      console.error('sendMessages failed:', e);
      setError('傳送確認訊息失敗(此功能僅能在 LINE App 內、與官方帳號的聊天室開啟表單時使用)');
    }
  }

  if (phase === 'init') {
    return <div className="liff-page"><p className="liff-status">載入中…</p></div>;
  }
  if (phase === 'error') {
    return (
      <div className="liff-page">
        <p className="liff-status">無法開啟表單:{error}</p>
        <p className="liff-status-sub">請從 LINE 官方帳號的選單重新開啟,或稍後再試。</p>
      </div>
    );
  }
  if (phase === 'done') {
    return (
      <div className="liff-page">
        <div className="liff-done">
          <span className="liff-done-icon" aria-hidden="true">✓</span>
          <h1>已收到你的諮詢!</h1>
          <p>我們會在一個工作天內與你聯絡。</p>
          {liff.isInClient() && !confirmSent && (
            <button className="btn btn-line btn-block" onClick={sendConfirm}>
              傳送一則確認訊息到聊天室
            </button>
          )}
          {confirmSent && <p className="liff-status-sub">確認訊息已傳送 ✓</p>}
          {liff.isInClient() && (
            <button className="btn btn-ghost btn-block" onClick={() => liff.closeWindow()}>
              關閉視窗
            </button>
          )}
          {error && <p className="form-error">{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="liff-page">
      <form className="liff-form" onSubmit={submit}>
        <h1>線上諮詢</h1>
        {profile && <p className="liff-hello">哈囉,{profile.displayName}!留下資料,Lumo 幫你顧 👇</p>}

        <label>
          店家/公司名稱 <b className="req">必填</b>
          <input value={form.company_name} onChange={set('company_name')} required maxLength={100} placeholder="例:小綠美髮" />
        </label>
        <label>
          聯絡人 <b className="req">必填</b>
          <input value={form.contact_name} onChange={set('contact_name')} required maxLength={100} placeholder="怎麼稱呼你?" />
        </label>
        <label>
          聯絡電話 <b className="req">必填</b>
          <input type="tel" value={form.phone} onChange={set('phone')} required maxLength={50} placeholder="0912-345-678" />
        </label>
        <label>
          想了解的方案
          <select value={form.plan_id} onChange={set('plan_id')}>
            <option value="">還不確定,先聊聊</option>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>
        <label>
          Email
          <input type="email" value={form.email} onChange={set('email')} maxLength={200} placeholder="選填" />
        </label>
        <label>
          業種
          <select value={form.industry} onChange={set('industry')}>
            <option value="">選填</option>
            {INDUSTRIES.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </label>
        <label>
          預算範圍
          <select value={form.budget_range} onChange={set('budget_range')}>
            <option value="">選填</option>
            {BUDGETS.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </label>
        <label>
          希望上線時間
          <select value={form.launch_timeline} onChange={set('launch_timeline')}>
            <option value="">選填</option>
            {TIMELINES.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </label>
        <label>
          目前已有的東西
          <select value={form.existing_assets} onChange={set('existing_assets')}>
            <option value="">選填</option>
            {ASSETS.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </label>
        <label>
          方便聯絡時段
          <select value={form.preferred_contact_time} onChange={set('preferred_contact_time')}>
            <option value="">選填</option>
            {CONTACT_TIMES.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </label>
        <label>
          需求描述
          <textarea rows={4} value={form.message} onChange={set('message')} maxLength={2000} placeholder="想解決什麼問題?目前怎麼收報名/接客人?" />
        </label>

        {error && <p className="form-error">{error}</p>}

        <button className="btn btn-line btn-block" type="submit" disabled={phase === 'submitting'}>
          {phase === 'submitting' ? '送出中…' : '送出諮詢'}
        </button>
      </form>
    </div>
  );
}
