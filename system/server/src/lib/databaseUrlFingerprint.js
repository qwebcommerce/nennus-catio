/**
 * معلومات غير حساسة عن DATABASE_URL (لتشخيص Vercel دون كشف كلمة المرور).
 */
export function databaseUrlFingerprint() {
  const raw = process.env.DATABASE_URL;
  if (!raw || typeof raw !== "string" || !raw.trim()) {
    return {
      databaseUrlSet: false,
      hint: "DATABASE_URL غير معرّف في بيئة التشغيل (تحقق من Vercel → Production + Redeploy).",
    };
  }

  const trimmed = raw.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    return {
      databaseUrlSet: true,
      looksLikePostgresUri: false,
      protocol: trimmed.split(":")[0],
      hint:
        "القيمة تبدأ بـ http(s) — هذا ليس رابط PostgreSQL. استخدم Connection string من Supabase → Database → URI (postgresql://...).",
    };
  }

  try {
    const u = new URL(trimmed);
    const host = u.hostname || "";
    const pgbouncer =
      u.searchParams.get("pgbouncer") === "true" ||
      /pgbouncer=true/i.test(u.search);
    const sslmode = u.searchParams.get("sslmode") || "";
    const isSupabase =
      host.includes("supabase.co") || host.includes("supabase.com");
    const portNum = u.port ? parseInt(u.port, 10) : 5432;
    const isSupabaseDirectIpv6Style =
      isSupabase &&
      /^db\./.test(host) &&
      host.endsWith(".supabase.co") &&
      portNum === 5432;
    // مضيف بحرف واحد (مثل Z) يعني غالباً DATABASE_URL معطوب أو كلمة مرور غير مُرمّزة
    const hostLooksBroken = !host || /^[A-Za-z]$/.test(host);
    let hint;
    if (hostLooksBroken) {
      hint =
        "اسم المضيف يبدو غير صالح (مثل Z أو قصير جداً). غالباً DATABASE_URL معطوب: لصق ناقص، أو كلمة مرور فيها @ أو : أو # دون ترميز URL — أعد نسخ السلسلة من Supabase واستبدل كلمة المرور فقط بعد ترميزها (مثلاً @ → %40).";
    } else if (isSupabaseDirectIpv6Style) {
      hint =
        "الاتصال المباشر db.*.supabase.co:5432 غالباً IPv6؛ Vercel غالباً IPv4 فيفشل الاتصال. في Supabase: Database → Connect → استخدم Transaction pooler (منفذ 6543، مضيف *.pooler.supabase.com) والصقه في DATABASE_URL مع ?pgbouncer=true&connection_limit=1&sslmode=require (انقل كلمة المرور بنفس الترميز). أو فعّل IPv4 add-on في Supabase.";
    } else if (!pgbouncer && host.includes("pooler")) {
      hint =
        portNum === 6543
          ? "Transaction pooler (6543): أضف ?pgbouncer=true&connection_limit=1&sslmode=require — مطلوب لـ Prisma."
          : "Session pooler (5432): إما أضف &pgbouncer=true&connection_limit=1، أو الأفضل انسخ Transaction pooler من Supabase (منفذ 6543) لتجنب EMAXCONNSESSION / نفاد جلسات الـ pool.";
    } else if (host.includes("pooler") && portNum === 5432) {
      hint =
        "أنت على Session pooler (5432). إن ظهر max clients / EMAXCONNSESSION، بدّل DATABASE_URL إلى Transaction pooler منفذ 6543 مع pgbouncer=true&connection_limit=1.";
    } else if (isSupabase && !sslmode) {
      hint =
        "جرّب إلحاق &sslmode=require (أو ?sslmode=require) إن فشل الاتصال من Vercel.";
    }
    const hintFinal =
      hint ||
      (isSupabase && (!pgbouncer || !sslmode || (host.includes("pooler") && portNum === 5432))
        ? "إن استمر الخطأ: أعد لصق DATABASE_URL من Supabase (Database → Connect → Transaction pooler، منفذ 6543)، واحفظ المتغير في Vercel لبيئة Production ثم Redeploy."
        : isSupabase
          ? undefined
          : undefined);
    return {
      databaseUrlSet: true,
      looksLikePostgresUri: true,
      host,
      port: u.port || "(افتراضي)",
      database: (u.pathname || "").replace(/^\//, "") || "(غير محدد)",
      pgbouncerParam: pgbouncer,
      sslmode: sslmode || "(غير مضبوط)",
      hint: hintFinal,
    };
  } catch {
    return {
      databaseUrlSet: true,
      looksLikePostgresUri: false,
      hint:
        "تعذر تحليل الرابط. تأكد أنه يبدأ بـ postgresql:// أو postgres:// وأن الرموز الخاصة في كلمة المرور مُرمّزة (URL-encoded).",
    };
  }
}
