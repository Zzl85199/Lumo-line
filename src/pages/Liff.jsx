import { useEffect, useState } from 'react'
import liff from '@line/liff'
import { supabase } from '../lib/supabase.js'

/**
 * LIFF 諮詢預約表單(官方 LIFF v2 SDK,@line/liff)
 * - liff.init → 未登入導 liff.login → liff.getProfile()(顯示用)
 * - 送出時把 liff.getAccessToken() 一併 POST 到 /api/inquiry,
 *   由後端驗證 token、寫入 Supabase、推播通知管理員。
 * - liff.sendMessages():在 LINE App 內、從聊天室開啟時,送出後回傳確認訊息
 *   (需 chat_message.write scope,失敗自動略過,不影響送單)。
 */

const LIFF_ID = import.meta.env.VITE_LIFF_ID

const BUDGET_OPTIONS = ['1 萬以下', '1–5 萬', '5–15 萬', '15–30 萬', '30 萬以上', '還不確定']
const TIMELINE_OPTIONS = ['一個月內', '1–3 個月', '3–6 個月', '半年以上', '還不確定']
const INDUSTRY_OPTIONS = ['補習班・教育', '餐飲', '美容美髮', '零售・電商', '醫療・診所', '運動・健身', '其他']
const EXISTING_OPTIONS = ['都還沒有', '已有 LINE 官方帳號', '已有網站', '兩者都有']
const CONTACT_TIME_OPTIONS = ['平日白天', '平日晚上', '週末', '都可以']

const EMPTY_FORM = {
  company_name: '',
  contact_name: '',
  phone: '',
  service_id: '',
  email: '',
  industry: '',
  budget_range: '',
  timeline: '',
  existing_assets: '',
  contact_time: '',
  note: '',
}

export default function Liff() {
  const [phase, setPhase] = useState('init') // init | ready | submitting | done | error
  const [initError, setInitError] = useState('')
  const [profile, setProfile] = useState(null)
  const [services, setServices] = useState([])
  const [form, setForm] = useState(EMPTY_FORM)
  const [submitError, setSubmitError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function boot() {
      try {
        if (!LIFF_ID) throw new Error('尚未設定 VITE_LIFF_ID')
        await liff.init({ liffId: LIFF_ID })
        if (!liff.isLoggedIn()) {
          liff.login({ redirectUri: window.location.href })
          return
        }
        const p = await liff.getProfile()
        if (cancelled) return
        setProfile({ userId: p.userId, displayName: p.displayName })

        if (supabase) {
          const { data, error } = await supabase
            .from('services')
            .select('id, name')
            .eq('is_active', true)
            .order('sort_order', { ascending: true })
          if (error) throw error
          if (!cancelled) setServices(data ?? [])
        }
        if (!cancelled) setPhase('ready')
      } catch (err) {
        console.error(err)
        if (!cancelled) {
          setInitError(err.message || String(err))
          setPhase('error')
        }
      }
    }
    boot()
    return () => { cancelled = true }
  }, [])

  const update = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  async function handleSubmit() {
    setSubmitError('')
    if (!form.company_name.trim() || !form.contact_name.trim() || !form.phone.trim()) {
      setSubmitError('請填寫店家名稱、聯絡人與電話。')
      return
    }
    setPhase('submitting')
    try {
      const accessToken = liff.getAccessToken()
      if (!accessToken) throw new Error('登入狀態過期,請重新開啟表單')

      const serviceName = services.find((s) => s.id === form.service_id)?.name || ''
      const res = await fetch('/api/inquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accessToken,
          form: { ...form, service_id: form.service_id || null, service_name: serviceName },
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data.error || `送出失敗(${res.status})`)

      // 在 LINE App 內、由聊天室開啟時,回傳一則確認訊息
      if (liff.isInClient()) {
        try {
          await liff.sendMessages([
            {
              type: 'text',
              text: `我已送出諮詢:${form.company_name}${serviceName ? `(${serviceName})` : ''},再麻煩與我聯絡,謝謝!`,
            },
          ])
        } catch (e) {
          console.warn('sendMessages skipped:', e)
        }
      }
      setPhase('done')
    } catch (err) {
      console.error(err)
      setSubmitError(err.message || '送出失敗,請稍後再試。')
      setPhase('ready')
    }
  }

  return (
    <div className="liff-page">
      <div className="liff-card">
        {phase === 'init' && <p className="status-note">載入中,請稍候…</p>}

        {phase === 'error' && (
          <>
            <h1>暫時無法開啟表單</h1>
            <p className="status-note">{initError}</p>
          </>
        )}

        {(phase === 'ready' || phase === 'submitting') && profile && (
          <>
            <h1>預約免費諮詢</h1>
            <p className="liff-hello">
              嗨,{profile.displayName}!留下基本資料,我們會盡快與您聯絡。標 * 為必填。
            </p>

            <div className="field">
              <label htmlFor="company">店家/公司名稱 *</label>
              <input id="company" value={form.company_name} onChange={update('company_name')} maxLength={100} />
            </div>
            <div className="field">
              <label htmlFor="contact">聯絡人 *</label>
              <input id="contact" value={form.contact_name} onChange={update('contact_name')} maxLength={50} autoComplete="name" />
            </div>
            <div className="field">
              <label htmlFor="phone">聯絡電話 *</label>
              <input id="phone" type="tel" value={form.phone} onChange={update('phone')} maxLength={20} autoComplete="tel" placeholder="0912-345-678" />
            </div>
            <div className="field">
              <label htmlFor="service">想了解的方案</label>
              <select id="service" value={form.service_id} onChange={update('service_id')}>
                <option value="">還不確定,想先聊聊</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="email">Email(選填)</label>
              <input id="email" type="email" value={form.email} onChange={update('email')} maxLength={100} autoComplete="email" />
            </div>
            <div className="field">
              <label htmlFor="industry">業種(選填)</label>
              <select id="industry" value={form.industry} onChange={update('industry')}>
                <option value="">請選擇</option>
                {INDUSTRY_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="budget">預算範圍(選填)</label>
              <select id="budget" value={form.budget_range} onChange={update('budget_range')}>
                <option value="">請選擇</option>
                {BUDGET_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="timeline">希望上線時間(選填)</label>
              <select id="timeline" value={form.timeline} onChange={update('timeline')}>
                <option value="">請選擇</option>
                {TIMELINE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="existing">目前已有的東西(選填)</label>
              <select id="existing" value={form.existing_assets} onChange={update('existing_assets')}>
                <option value="">請選擇</option>
                {EXISTING_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="ctime">方便聯絡時段(選填)</label>
              <select id="ctime" value={form.contact_time} onChange={update('contact_time')}>
                <option value="">請選擇</option>
                {CONTACT_TIME_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="note">需求描述(選填)</label>
              <textarea id="note" rows={3} value={form.note} onChange={update('note')} maxLength={1000} placeholder="例:想做加好友自動回覆和線上預約…" />
            </div>

            {submitError && <p className="form-error">{submitError}</p>}

            <button className="btn btn-submit" onClick={handleSubmit} disabled={phase === 'submitting'}>
              {phase === 'submitting' ? '送出中…' : '送出諮詢'}
            </button>
            <p className="status-note" style={{ marginTop: '0.8rem', fontSize: '0.8rem' }}>
              送出即表示同意我們為聯絡與報價目的使用上述資料。
            </p>
          </>
        )}

        {phase === 'done' && (
          <div className="liff-done">
            <div className="big">✅</div>
            <h1>已收到您的諮詢!</h1>
            <p>我們會盡快與您聯絡,一起看看怎麼幫您的店數位化。</p>
            {liff.isInClient() && (
              <button className="btn btn-ghost" onClick={() => liff.closeWindow()}>回到聊天室</button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
