import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

const ADD_FRIEND_URL = import.meta.env.VITE_LINE_ADD_FRIEND_URL || 'https://lin.ee/QAlhRie';

/* 撈不到 Supabase 時的備援方案資料(結構與 /api/plans 相同) */
const FALLBACK_PLANS = [
  {
    id: 'lite',
    name: '輕量方案',
    tagline: '先把 LINE 顧起來,小預算也能自動回覆',
    features: ['LINE 官方帳號申請與基本設定', '加好友歡迎訊息', '關鍵字自動回覆(5 組)', '基礎圖文選單 1 版'],
    price: 12000,
    show_price: true,
  },
  {
    id: 'standard',
    name: '標準方案',
    tagline: 'LINE 機器人 + 一頁式形象網站,店面線上化一次到位',
    features: ['輕量方案全部內容', '一頁式形象網站(RWD)', 'LIFF 線上諮詢/報名表單', '報名資料自動存資料庫', '上線後 30 天免費調整'],
    price: 38000,
    show_price: true,
  },
  {
    id: 'flagship',
    name: '旗艦方案',
    tagline: '客製整合與後台,依你的店量身打造',
    features: ['標準方案全部內容', '多頁式網站與品牌視覺', '報名資料管理後台', '訂位/課程等客製 LINE 功能', '專屬維運與優先支援'],
    price: null,
    show_price: false,
  },
];

/* 手機 demo 的對話腳本:展示加好友後機器人怎麼回 */
const CHAT_SCRIPT = [
  { from: 'user', text: '你好,想問價格' },
  { from: 'bot', text: '嗨,歡迎!Lumo 目前有三種方案 👇' },
  { from: 'bot', text: '▍輕量方案\n先把 LINE 顧起來\n💰 NT$ 12,000 起' },
  { from: 'user', text: '想預約諮詢!' },
  { from: 'bot', text: '沒問題!點選單「預約諮詢」填表單,一個工作天內回覆你 😊' },
];

function useChatDemo() {
  const [visible, setVisible] = useState(0);
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      setVisible(CHAT_SCRIPT.length);
      return;
    }
    let alive = true;
    let i = 0;
    const step = () => {
      if (!alive) return;
      if (i >= CHAT_SCRIPT.length) {
        setTimeout(() => {
          if (!alive) return;
          i = 0;
          setVisible(0);
          setTimeout(step, 800);
        }, 3200);
        return;
      }
      const isBot = CHAT_SCRIPT[i].from === 'bot';
      setTyping(isBot);
      setTimeout(() => {
        if (!alive) return;
        setTyping(false);
        i += 1;
        setVisible(i);
        setTimeout(step, 900);
      }, isBot ? 900 : 500);
    };
    const t = setTimeout(step, 900);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, []);
  return { visible, typing };
}

export default function Home() {
  const [plans, setPlans] = useState(null);
  const { visible, typing } = useChatDemo();
  const chatBodyRef = useRef(null);

  useEffect(() => {
    fetch('/api/plans')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setPlans(d.plans?.length ? d.plans : FALLBACK_PLANS))
      .catch(() => setPlans(FALLBACK_PLANS));
  }, []);

  useEffect(() => {
    const el = chatBodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [visible, typing]);

  const shownPlans = plans || FALLBACK_PLANS;

  return (
    <div className="page">
      <header className="topbar">
        <a className="brand" href="#top">
          <span className="brand-dot" aria-hidden="true" />
          Lumo・幫你顧
        </a>
        <nav className="topnav" aria-label="主選單">
          <a href="#services">服務</a>
          <a href="#plans">方案</a>
          <a href="#contact">聯絡</a>
          <a className="btn btn-line btn-sm" href={ADD_FRIEND_URL} target="_blank" rel="noreferrer">
            加 LINE 好友
          </a>
        </nav>
      </header>

      {/* ── Hero:標語 + 手機 LINE 對話 demo ── */}
      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow">補習班・美髮廳・餐飲・工作室</p>
          <h1>
            小店的數位大小事,
            <br />
            <em>Lumo 幫你顧好</em>
          </h1>
          <p className="lead">
            你顧店,我們顧 LINE 和網站。從自動回覆機器人到線上報名系統,
            一次把客人問的、你要記的,通通接起來。
          </p>
          <div className="hero-actions">
            <a className="btn btn-line" href={ADD_FRIEND_URL} target="_blank" rel="noreferrer">
              加 LINE 好友,免費諮詢
            </a>
            <a className="btn btn-ghost" href="#plans">
              看服務方案
            </a>
          </div>
        </div>

        <div className="phone-wrap" aria-label="LINE 機器人自動回覆示範">
          <div className="phone">
            <div className="phone-head">
              <span className="phone-avatar" aria-hidden="true">L</span>
              <div>
                <strong>Lumo・幫你顧</strong>
                <small>回覆速度:秒回</small>
              </div>
            </div>
            <div className="phone-body" ref={chatBodyRef}>
              {CHAT_SCRIPT.slice(0, visible).map((m, i) => (
                <div key={i} className={`bubble ${m.from}`}>
                  {m.text}
                </div>
              ))}
              {typing && (
                <div className="bubble bot typing" aria-hidden="true">
                  <span /><span /><span />
                </div>
              )}
            </div>
            <div className="phone-foot" aria-hidden="true">
              <span className="fake-input">輸入訊息…</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── 服務 ── */}
      <section className="section" id="services">
        <h2 className="section-title">我們幫你顧什麼</h2>
        <ul className="services">
          {[
            ['🤖', 'LINE 自動回覆機器人', '客人問方案、價格、營業時間,機器人秒回,你專心做生意。'],
            ['📋', 'LIFF 線上報名系統', '報名、預約、諮詢都在 LINE 裡填,資料自動存進資料庫。'],
            ['🎨', '圖文選單設計', '把最常被問的事做成選單按鈕,客人一點就到。'],
            ['🌐', '形象網站建置', '行動優先的一頁式官網,搜得到、看得懂、連得上 LINE。'],
            ['🗂️', '報名資料後台', '名單集中管理、追蹤狀態,不再翻聊天記錄找電話。'],
          ].map(([icon, title, desc]) => (
            <li key={title} className="service-card">
              <span className="service-icon" aria-hidden="true">{icon}</span>
              <h3>{title}</h3>
              <p>{desc}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* ── 方案(Supabase)── */}
      <section className="section section-tint" id="plans">
        <h2 className="section-title">三種方案,照你的節奏上線</h2>
        <div className="plans">
          {shownPlans.map((p, idx) => (
            <article key={p.id} className={`plan-card ${idx === 1 ? 'featured' : ''}`}>
              {idx === 1 && <span className="plan-badge">最多店家選</span>}
              <h3>{p.name}</h3>
              <p className="plan-tagline">{p.tagline}</p>
              <p className="plan-price">
                {p.show_price && p.price != null
                  ? <>NT$ {Number(p.price).toLocaleString('zh-TW')} <small>起</small></>
                  : '加 LINE 詢價'}
              </p>
              <ul className="plan-features">
                {(Array.isArray(p.features) ? p.features : []).map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
              <a className="btn btn-line btn-block" href={ADD_FRIEND_URL} target="_blank" rel="noreferrer">
                加 LINE 聊聊這個方案
              </a>
            </article>
          ))}
        </div>
        <p className="plans-note">
          已加好友?也可以直接<Link to="/liff">填線上諮詢表單</Link>(建議從 LINE 選單開啟)。
        </p>
      </section>

      {/* ── 聯絡 ── */}
      <section className="section" id="contact">
        <h2 className="section-title">聯絡 Lumo</h2>
        <div className="contact-grid">
          <div className="contact-card">
            <dl>
              <div><dt>電話</dt><dd><a href="tel:0212345678">02-1234-5678</a></dd></div>
              <div><dt>Email</dt><dd><a href="mailto:hello@lumo.tw">hello@lumo.tw</a></dd></div>
              <div><dt>服務時間</dt><dd>週一至週五 09:00–18:00</dd></div>
              <div><dt>最快的方式</dt><dd>加 LINE 好友,輸入「諮詢」</dd></div>
            </dl>
            <a className="btn btn-line btn-block" href={ADD_FRIEND_URL} target="_blank" rel="noreferrer">
              加 LINE 好友
            </a>
          </div>
          <div className="map-wrap">
            {/* TODO: 把 q= 後面換成實際地址或店名 */}
            <iframe
              title="Lumo 工作室位置"
              src="https://www.google.com/maps?q=%E5%8F%B0%E5%8C%97%E5%B8%82&output=embed"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              allowFullScreen
            />
          </div>
        </div>
      </section>

      <footer className="footer">
        <p>© {new Date().getFullYear()} Lumo・幫你顧 — 小店的數位大小事,Lumo 幫你顧好</p>
      </footer>
    </div>
  );
}
