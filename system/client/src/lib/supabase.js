import { createClient } from "@supabase/supabase-js";

/** للقراءة المباشرة من المتصفح (اختياري) — استخدم VITE_SUPABASE_URL و VITE_SUPABASE_ANON_KEY */
export function getSupabaseBrowser() {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}
