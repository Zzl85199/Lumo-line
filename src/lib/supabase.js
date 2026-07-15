import { createClient } from '@supabase/supabase-js'

// anon key 搭配 RLS:前端只能讀上架課程、新增報名(見 supabase/schema.sql)
const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = url && anonKey ? createClient(url, anonKey) : null
