-- ═══════════════════════════════════════════════════════════════
-- Lumo・幫你顧 — Supabase(Postgres)Schema
-- 在 Supabase Dashboard → SQL Editor 貼上整份執行即可
-- ═══════════════════════════════════════════════════════════════

-- ── 服務方案表 ──────────────────────────────────────────────
-- 官網方案區、LIFF 下拉、bot「方案/價格」關鍵字共用讀取
create table if not exists public.service_plans (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,                     -- 方案名稱(輕量/標準/旗艦)
  tagline       text,                              -- 一句話賣點
  features      jsonb not null default '[]'::jsonb,-- 內容明細,字串陣列
  price         integer,                           -- 價格(NT$,整數)
  show_price    boolean not null default true,     -- false 時對外顯示「加 LINE 詢價」
  is_published  boolean not null default true,     -- 是否上架
  sort_order    integer not null default 0,        -- 排序(小到大)
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- updated_at 自動更新
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_service_plans_updated_at on public.service_plans;
create trigger trg_service_plans_updated_at
  before update on public.service_plans
  for each row execute function public.set_updated_at();

-- ── 諮詢單表 ──────────────────────────────────────────────
create table if not exists public.inquiries (
  id                      uuid primary key default gen_random_uuid(),
  line_user_id            text not null,           -- 由 Worker 驗完 token 後從 LINE 取得
  line_display_name       text,
  company_name            text not null,           -- 店家/公司名稱(必填)
  contact_name            text not null,           -- 聯絡人(必填)
  phone                   text not null,           -- 聯絡電話(必填)
  email                   text,
  plan_id                 uuid references public.service_plans(id) on delete set null,
  industry                text,                    -- 業種
  budget_range            text,                    -- 預算範圍
  launch_timeline         text,                    -- 希望上線時間
  existing_assets         text,                    -- 目前已有的東西
  preferred_contact_time  text,                    -- 方便聯絡時段
  message                 text,                    -- 需求描述
  status                  text not null default 'new'
                          check (status in ('new','contacted','quoted','won','lost')),
  created_at              timestamptz not null default now()
);

create index if not exists idx_inquiries_status     on public.inquiries (status);
create index if not exists idx_inquiries_created_at on public.inquiries (created_at desc);

-- ═══════════════════════════════════════════════════════════════
-- Row Level Security
--   原則:
--   * service_plans:anon 只能「讀」且僅限 is_published = true
--   * inquiries:對 anon 完全不開放(啟用 RLS 且不建任何 anon 政策 = 全拒)
--   * Worker 用 service role key 寫入 → service role 會繞過 RLS,不需政策
-- ═══════════════════════════════════════════════════════════════

alter table public.service_plans enable row level security;
alter table public.inquiries     enable row level security;

drop policy if exists "anon can read published plans" on public.service_plans;
create policy "anon can read published plans"
  on public.service_plans
  for select
  to anon
  using (is_published = true);

-- inquiries 刻意「不建任何政策」:啟用 RLS 後預設全拒,
-- anon / authenticated 讀寫都會被擋,只有 service role(繞過 RLS)可操作。

-- ═══════════════════════════════════════════════════════════════
-- 種子資料:三個方案(價格自己改)
-- ═══════════════════════════════════════════════════════════════

insert into public.service_plans (name, tagline, features, price, show_price, is_published, sort_order)
values
  (
    '輕量方案',
    '先把 LINE 顧起來,小預算也能自動回覆',
    '["LINE 官方帳號申請與基本設定","加好友歡迎訊息","關鍵字自動回覆(5 組)","基礎圖文選單 1 版"]'::jsonb,
    12000, true, true, 1
  ),
  (
    '標準方案',
    'LINE 機器人 + 一頁式形象網站,店面線上化一次到位',
    '["輕量方案全部內容","一頁式形象網站(RWD)","LIFF 線上諮詢/報名表單","報名資料自動存資料庫","上線後 30 天免費調整"]'::jsonb,
    38000, true, true, 2
  ),
  (
    '旗艦方案',
    '客製整合與後台,依你的店量身打造',
    '["標準方案全部內容","多頁式網站與品牌視覺","報名資料管理後台","訂位/課程等客製 LINE 功能","專屬維運與優先支援"]'::jsonb,
    null, false, true, 3
  );
