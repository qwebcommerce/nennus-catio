import crypto from "crypto";

const PREFIX = "enc:v1:";

/** مفتاح التشفير: يُفضّل SYNC_ENCRYPTION_KEY ثم JWT_SECRET */
export function getCryptoPassword() {
  return process.env.SYNC_ENCRYPTION_KEY || process.env.JWT_SECRET || "petstore-dev-only";
}

export function encryptSecret(plain) {
  if (plain == null || plain === "") return null;
  const pwd = getCryptoPassword();
  const key = crypto.scryptSync(pwd, "petstore-sync-salt-v1", 32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const out = Buffer.concat([iv, tag, enc]).toString("base64url");
  return PREFIX + out;
}

export function decryptSecret(stored) {
  if (stored == null || stored === "") return null;
  if (!String(stored).startsWith(PREFIX)) {
    return String(stored);
  }
  const pwd = getCryptoPassword();
  const key = crypto.scryptSync(pwd, "petstore-sync-salt-v1", 32);
  const raw = Buffer.from(String(stored).slice(PREFIX.length), "base64url");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const data = raw.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
