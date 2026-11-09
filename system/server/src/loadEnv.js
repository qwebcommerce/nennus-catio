import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

/** يحمّل `server/.env` محلياً فقط — على Vercel تُستخدم متغيرات المشروع فقط (تجنّب تعارض مع DATABASE_URL) */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "..", ".env");

if (process.env.VERCEL) {
  /* لا تُحمّل ملف .env على Vercel */
} else {
  const result = dotenv.config({ path: envPath });
  if (
    result.error &&
    process.env.NODE_ENV !== "test" &&
    !process.env.DATABASE_URL
  ) {
    console.warn(
      "[loadEnv] لم يُعثر على .env في",
      envPath,
      "— المتغيرات الافتراضية من النظام فقط"
    );
  }
}
