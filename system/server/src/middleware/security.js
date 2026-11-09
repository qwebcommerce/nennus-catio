import helmet from "helmet";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";

export const helmetMiddleware = helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: false,
});

/**
 * خلف Vite proxy يكون request.ip أحياناً غير متوافق مع تحققات express-rate-limit v8
 * (فيُسجَّل خطأ ويتحول إلى 500). نستخدم ipKeyGenerator الرسمي مع IP آمن.
 */
function rateLimitKey(req) {
  const raw = req.ip || req.socket?.remoteAddress;
  const ip = raw == null || raw === "" ? "127.0.0.1" : String(raw);
  return ipKeyGenerator(ip, 56);
}

export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "محاولات تسجيل دخول كثيرة. انتظر قليلاً ثم أعد المحاولة." },
  keyGenerator: rateLimitKey,
});

export const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "تم تجاوز حد الطلبات. حاول بعد لحظات." },
  keyGenerator: rateLimitKey,
});
