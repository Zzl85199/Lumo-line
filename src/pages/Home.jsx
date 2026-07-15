import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'

const ADD_FRIEND_URL = import.meta.env.VITE_LINE_ADD_FRIEND_URL || '#'

// 與 supabase/schema.sql 的種子資料一致;Supabase 讀不到時的預設顯示
const DEFAULT_PLANS = [
  { id: 'p1', name: '輕量方案|LINE 機器人入門', tagline: '先讓官方帳號動起來',
    description: '加好友自動歡迎訊息\n關鍵字自動回覆(10 組內)\n圖文選單設計 1 版\n基本設定教學',
    price: 5000, show_price: false },
  { id: 'p2', name: '標準方案|LINE 機器人 + 形象網站', tagline: '線上門面一次到位',
    description: '輕量方案全部內容\n一頁式形象網站(RWD)\nLIFF 線上諮詢/預約表單\n表單資料自動存入資料庫\n上線後 3 個月內容微調',
    price: 80000, show_price: true },
  { id: 'p3', name: '旗艦方案|全包客製 + 一年維護', tagline: '把數位這件事整包交出來',
    description: '標準方案全部內容\n多頁式網站與自訂網域\n客製化機器人流程(分眾、標籤、推播)\n報名/名單管理後台\n一年維護與每月成效報告',
    price: 300000, show_price: true },
]

function priceLabel(p) {
  return p.show_price && p.price != null ? `NT$ ${Number(p.price).toLocaleString()} 起` : '加 LINE 詢價'
}

const SERVICES = [
  { icon: '🤖', title: 'LINE 自動回覆機器人', desc: '加好友自動迎賓、關鍵字秒回,深夜詢問也不漏接。' },
  { icon: '📋', title: 'LIFF 線上報名系統', desc: '在 LINE 裡直接填表報名,資料自動進資料庫,不用再抄 Excel。' },
  { icon: '🎛️', title: '圖文選單設計', desc: '把報名、課程、聯絡做成一鍵選單,長輩也會用。' },
  { icon: '🌐', title: '形象網站建置', desc: '一頁式行動優先網站,Google 搜得到、名片掃得到。' },
  { icon: '📊', title: '報名資料後台', desc: '報名名單即時同步 Supabase,匯出、統計、跟進一目了然。' },
]

export default function Home() {
  return (
    <>
      <header className="site-header">
        <div className="container">
          <a className="brand" href="/">Lumo<span className="dot">・</span>幫你顧</a>
          <a className="header-cta" href={ADD_FRIEND_URL} target="_blank" rel="noreferrer">加 LINE 好友</a>
        </div>
      </header>

      <main>
        {/* Hero:招牌元素 = 手機裡的 LINE 對話 demo */}
        <section className="hero">
          <div className="container">
            <div>
              <span className="eyebrow">LINE 機器人 × 形象網站</span>
              <h1>小店的數位大小事,<br /><em>Lumo 幫你顧</em>好。</h1>
              <p className="lead">
                專為補習班、工作室與小型店家打造:加好友自動介紹、圖文選單、
                LINE 內一分鐘報名,名單直接進資料庫。你顧好本業,數位交給我們。
              </p>
              <div className="hero-actions">
                <a className="btn btn-line" href={ADD_FRIEND_URL} target="_blank" rel="noreferrer">
                  ➕ 加 LINE 好友,立即體驗
                </a>
                <a className="btn btn-ghost" href="#services">看看我們能幫什麼</a>
              </div>
            </div>

            <div className="phone" aria-hidden="true">
              <div className="phone-screen">
                <div className="chat-title">Lumo 示範帳號</div>
                <div className="bubble user">你好,想幫我的店做 LINE 機器人</div>
                <div className="bubble bot">您好!✨ 我們有三種方案,從入門到全包客製。輸入「方案」看內容,或「諮詢」預約免費諮詢!</div>
                <div className="bubble user">諮詢</div>
                <div className="bubble bot">請點下方「預約諮詢」,約 1 分鐘填完,我們會盡快與您聯絡 ✅</div>
              </div>
            </div>
          </div>
        </section>

        <section className="services" id="services">
          <div className="container">
            <span className="eyebrow">服務項目</span>
            <h2>你顧生意,這些交給 Lumo</h2>
            <div className="service-grid">
              {SERVICES.map((s) => (
                <div className="service-card" key={s.title}>
                  <span className="icon" aria-hidden="true">{s.icon}</span>
                  <h3>{s.title}</h3>
                  <p>{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="plans" id="plans">
          <div className="container">
            <span className="eyebrow">服務方案</span>
            <h2>三種方案,從入門到全包</h2>
            <PlanGrid />
          </div>
        </section>

        <section className="steps">
          <div className="container">
            <span className="eyebrow">合作流程</span>
            <h2>三步驟,兩週內上線</h2>
            <ol>
              <li><strong>免費諮詢</strong><br />加 LINE 聊聊你的店與需求,當天回覆規劃方向。</li>
              <li><strong>建置與試用</strong><br />機器人、選單、報名表單先做給你玩,滿意再上線。</li>
              <li><strong>上線與維護</strong><br />正式啟用後持續調整關鍵字與內容,名單自動累積。</li>
            </ol>
          </div>
        </section>

        <section className="contact" id="contact">
          <div className="container">
            <span className="eyebrow">聯絡我們</span>
            <h2>找 Lumo 聊聊</h2>
            <div className="contact-grid">
              <div className="contact-card">
                <p>📍 台北市某某區某某路 123 號(請替換)</p>
                <p>🕘 週一至週五 09:00–18:00</p>
                <p>☎️ 02-1234-5678</p>
                <p>✉️ hello@lumo.example</p>
                <p style={{ marginTop: '1rem' }}>
                  <a className="btn btn-line" href={ADD_FRIEND_URL} target="_blank" rel="noreferrer">
                    ➕ 用 LINE 最快
                  </a>
                </p>
              </div>
              <iframe
                className="map-embed"
                title="Google Maps 位置"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                // 請到 Google Maps > 分享 > 嵌入地圖,把 src 換成自己店面的網址
                src="https://www.google.com/maps?q=Taipei+101&output=embed"
              />
            </div>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="container">© {new Date().getFullYear()} Lumo 幫你顧 · 小店的數位好夥伴</div>
      </footer>
    </>
  )
}

function PlanGrid() {
  const [plans, setPlans] = useState(DEFAULT_PLANS)

  useEffect(() => {
    if (!supabase) return
    supabase
      .from('services')
      .select('id, name, tagline, description, price, show_price')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .then(({ data, error }) => {
        if (!error && data?.length) setPlans(data)
      })
  }, [])

  return (
    <div className="plan-grid">
      {plans.map((p, i) => (
        <div className={`plan-card${i === 1 ? ' featured' : ''}`} key={p.id}>
          {i === 1 && <span className="plan-badge">最多人選</span>}
          <h3>{p.name}</h3>
          <p className="plan-tagline">{p.tagline}</p>
          <p className="plan-price">{priceLabel(p)}</p>
          <ul className="plan-list">
            {(p.description || '').split('\n').filter(Boolean).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <a className="btn btn-line" href={ADD_FRIEND_URL} target="_blank" rel="noreferrer">
            加 LINE 詢問這個方案
          </a>
        </div>
      ))}
    </div>
  )
}
