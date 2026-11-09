import { Prisma } from "./prisma-client-bundle.js";

const KNOWN_DB_CODES = [
  "P1000",
  "P1001",
  "P1002",
  "P1003",
  "P1010",
  "P1017",
  /** انتهاء مهلة تجمع الاتصالات (ضغط على Supabase أو عدة عمليات متزامنة) */
  "P2024",
];

/** أخطاء اتصال/تهيئة شائعة على Vercel عند غياب أو خطأ DATABASE_URL */
export function isDbUnavailableError(e) {
  if (!e || typeof e !== "object") return false;
  if (e instanceof Prisma.PrismaClientInitializationError) return true;
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    return KNOWN_DB_CODES.includes(e.code);
  }
  const msg = String(e.message || "");
  if (
    /P1001|P1000|P1017|P2024|EMAXCONNSESSION|max clients reached|Can't reach database server|connection (refused|timed out|closed)|Server has closed the connection|database server is running|Timed out fetching a new connection from the connection pool|Error in connector/i.test(
      msg
    )
  ) {
    return true;
  }
  return false;
}

export const dbUnavailableMessage =
  "قاعدة البيانات غير متاحة مؤقتاً أو انتهت مهلة الاتصال. أعد المحاولة بعد لحظات. على الإنتاج تحقق من DATABASE_URL (مثلاً Transaction pooler مع pgbouncer=true وconnection_limit=1).";

export const dbUnavailableMessageEn =
  "Database is temporarily unavailable or the connection pool is exhausted. Retry shortly. On production use the Supabase Transaction pooler (port 6543) with pgbouncer=true&connection_limit=1.";

/** جدول/عمود مفقود — غالباً ترحيلات Prisma لم تُطبَّق أو توقفت بحالة خطأ */
const SCHEMA_DRIFT_CODES = new Set(["P2021", "P2022"]);

export function isSchemaDriftError(e) {
  if (!e || typeof e !== "object") return false;
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    return SCHEMA_DRIFT_CODES.has(e.code);
  }
  return false;
}

export const schemaDriftMessage =
  "مخطط قاعدة البيانات غير متزامن مع التطبيق (جدول أو عمود ناقص). على الخادم نفّذ: npx prisma migrate deploy. إذا توقفت الترحيلات بخطأ، راجع prisma migrate status ثم أصلح التعارض (مثلاً prisma migrate resolve) قبل إعادة المحاولة.";
