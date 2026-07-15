-- ============================================================
-- Lumo 幫你顧(自家官網 + LINE bot)— Supabase Schema
-- 貼到 Supabase Dashboard > SQL Editor 執行
-- ============================================================

-- 1) 服務方案表:bot「方案/價格」關鍵字、官網方案區、LIFF 下拉都讀這張
create table if not exists public.services (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  tagline     text,                     -- 一句話賣點
  description text,                     -- 內容明細(換行分隔)
  price       numeric(10, 0),           -- 台幣
  show_price  boolean not null default true,  -- false = 顯示「加 LINE 詢價」
  is_active   boolean not null default true,
  sort_order  int not null default 100,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- 2) 諮詢單:LIFF 表單送出後由後端(service_role)寫入
create table if not exists public.inquiries (
  id             uuid primary key default gen_random_uuid(),
  line_user_id   text not null,         -- 後端驗證 LIFF access token 後取得
  display_name   text,
  company_name   text not null,         -- 店家/公司名稱
  contact_name   text not null,         -- 聯絡人
  phone          text not null,
  email          text,                  -- 選填
  service_id     uuid references public.services (id) on delete set null,
  industry       text,                  -- 選填:業種
  budget_range   text,                  -- 選填:預算範圍
  timeline       text,                  -- 選填:希望上線時間
  existing_assets text,                 -- 選填:目前已有 LINE 官方帳號/網站
  contact_time   text,                  -- 選填:方便聯絡時段
  note           text,                  -- 選填:需求描述
  status         text not null default 'new'
                 check (status in ('new', 'contacted', 'quoted', 'won', 'lost')),
  created_at     timestamptz not null default now()
);

create index if not exists inquiries_line_user_id_idx on public.inquiries (line_user_id);
create index if not exists inquiries_created_at_idx   on public.inquiries (created_at desc);
create index if not exists inquiries_status_idx       on public.inquiries (status);

-- updated_at 自動更新
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists services_set_updated_at on public.services;
create trigger services_set_updated_at
  before update on public.services
  for each row execute function public.set_updated_at();

-- ============================================================
-- Row Level Security
-- ============================================================

alter table public.services  enable row level security;
alter table public.inquiries enable row level security;

-- 前端(anon)只能讀「上架中的方案」(官網方案區、LIFF 下拉用)
drop policy if exists "anon can read active services" on public.services;
create policy "anon can read active services"
  on public.services for select
  to anon
  using (is_active = true);

-- inquiries 完全不開放 anon:寫入一律走後端 /api/inquiry(service_role,
-- 先驗 LIFF access token 再寫入 + 推播通知),前端拿 anon key 讀寫都會被拒。

-- ============================================================
-- 三個方案(低→高;最低階依需求顯示「加 LINE 詢價」)
-- ============================================================
insert into public.services (name, tagline, description, price, show_price, sort_order) values
  (
    '輕量方案|LINE 機器人入門',
    '先讓官方帳號動起來',
    '加好友自動歡迎訊息\n關鍵字自動回覆(10 組內)\n圖文選單設計 1 版\n基本設定教學',
    5000, false, 10   -- show_price = false → 前台顯示「加 LINE 詢價」
  ),
  (
    '標準方案|LINE 機器人 + 形象網站',
    '線上門面一次到位',
    '輕量方案全部內容\n一頁式形象網站(RWD)\nLIFF 線上諮詢/預約表單\n表單資料自動存入資料庫\n上線後 3 個月內容微調',
    80000, true, 20
  ),
  (
    '旗艦方案|全包客製 + 一年維護',
    '把數位這件事整包交出來',
    '標準方案全部內容\n多頁式網站與自訂網域\n客製化機器人流程(分眾、標籤、推播)\n報名/名單管理後台\n一年維護與每月成效報告',
    300000, true, 30
  )
on conflict do nothing;

-- ============================================================
-- 兩把 key 的使用原則
-- ------------------------------------------------------------
-- anon key(公開,VITE_SUPABASE_ANON_KEY):只給前端,受 RLS 限制,
--   實際上只能 SELECT 上架中的 services。
-- service_role key(SUPABASE_SERVICE_ROLE_KEY):只給 Pages Functions
--   (webhook 與 /api/inquiry),繞過 RLS,絕不進前端與 git。
-- ============================================================
