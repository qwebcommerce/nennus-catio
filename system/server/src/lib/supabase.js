import { createClient } from "@supabase/supabase-js";

/** عميل Supabase للخادم — يستخدم متغيرات البيئة (لا تُعرض للمتصفح) */
export function getSupabaseServer() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
