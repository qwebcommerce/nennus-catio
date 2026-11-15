import { z } from "zod";

/**
 * Public site settings as served by `GET /api/site-settings` and consumed by the public shell.
 * This is a response contract, not the database row: `version`, `updatedAt` and any future
 * staff-only fields are never part of it. Lengths mirror the `site_settings` columns.
 */
export const localisedTextSchema = z.object({
  en: z.string().max(500),
  ar: z.string().max(500),
});

/** Only absolute HTTPS links may reach the public shell. */
export const httpsUrlSchema = z.url({ protocol: /^https$/ }).max(500);

/** A business number as stored and served: "+", the country code and the number, 8-15 digits. */
export const internationalPhoneSchema = z.string().regex(/^\+[1-9]\d{7,14}$/);

/**
 * Reads a business number typed by staff (D232): a Qatari number (8 digits, with or without 974,
 * +974 or 00974), or another country's number with its code after + or 00. Spaces, brackets and
 * dashes are ignored. Returns it in international form ("+97444445555"), or null.
 */
export function toInternationalPhone(value: string): string | null {
  const compact = value.replace(/[\s()-]/g, "");
  const qatar = /^(?:\+974|00974|974)?([2-9]\d{7})$/.exec(compact);
  if (qatar) return `+974${qatar[1]}`;
  // Qatar's code with anything but a Qatari number after it is a typing mistake.
  if (/^(?:\+|00)974/.test(compact)) return null;
  const other = /^(?:\+|00)([1-9]\d{7,14})$/.exec(compact);
  return other ? `+${other[1]}` : null;
}

/** A stored number for people to read: Qatar's in groups (+974 4444 5555), others as stored. */
export function formatPhone(international: string): string {
  const qatar = /^\+974(\d{4})(\d{4})$/.exec(international);
  return qatar ? `+974 ${qatar[1]} ${qatar[2]}` : international;
}

export const publicSiteSettingsSchema = z.object({
  brand: localisedTextSchema,
  description: localisedTextSchema,
  headline: localisedTextSchema,
  hours: localisedTextSchema,
  currency: z.string().regex(/^[A-Z]{3}$/),
  timeZone: z.string().min(1).max(64),
  /** The business phone for calls (D232); null hides it. WhatsApp stays a link below. */
  phone: internationalPhoneSchema.nullable(),
  socialLinks: z.object({
    instagram: httpsUrlSchema.nullable(),
    instagramGrooming: httpsUrlSchema.nullable(),
    instagramProjects: httpsUrlSchema.nullable(),
    facebook: httpsUrlSchema.nullable(),
    whatsapp: httpsUrlSchema.nullable(),
  }),
});

export type PublicSiteSettings = z.infer<typeof publicSiteSettingsSchema>;
