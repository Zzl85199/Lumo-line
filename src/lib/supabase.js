import { createClient } from '@supabase/supabase-js'

// 前端只用 anon key,受 RLS 限制,實際上只能讀「上架中的 services」。
// 未設定環境變數時匯出 null,元件會退回預設資料顯示(不會壞版)。
const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = url && anonKey ? createClient(url, anonKey) : null
