import { z } from "zod";
import { permissionMapSchema } from "./access.js";

/**
 * Authentication request/response contracts (branch #4). Customers and staff are separate:
 * customer endpoints live under `/api/auth`, staff endpoints under `/api/admin`.
 * The limits below are provisional engineering defaults (owner question A01).
 */
export const PASSWORD_MIN_LENGTH = 10;
export const TEMPORARY_PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

export const localeSchema = z.enum(["en", "ar"]);

/** Emails are compared and stored lower-cased; Gmail dots/plus aliases are treated as written. */
export const emailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email());

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH)
  .max(PASSWORD_MAX_LENGTH);

export const temporaryPasswordSchema = z
  .string()
  .min(TEMPORARY_PASSWORD_MIN_LENGTH)
  .max(PASSWORD_MAX_LENGTH);

/** Login only checks presence: policy errors here would reveal nothing useful and block old passwords. */
const loginPasswordSchema = z.string().min(1).max(PASSWORD_MAX_LENGTH);

/** One-time email link tokens are 43-character base64url strings. */
export const oneTimeTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{32,128}$/);

const notTheEmail = (value: { email: string; password: string }) =>
  value.password.trim().toLowerCase() !== value.email;

// --- Customers -------------------------------------------------------------------------------

export const customerRegisterRequestSchema = z
  .object({ email: emailSchema, password: passwordSchema, locale: localeSchema })
  .refine(notTheEmail, { path: ["password"], message: "Password must not be your email address." });

export const customerLoginRequestSchema = z.object({
  email: emailSchema,
  password: loginPasswordSchema,
});

export const emailRequestSchema = z.object({ email: emailSchema, locale: localeSchema });

export const verifyEmailRequestSchema = z.object({ token: oneTimeTokenSchema });

export const resetPasswordRequestSchema = z.object({
  token: oneTimeTokenSchema,
  password: passwordSchema,
});

export const customerProfileSchema = z.object({
  id: z.string(),
  email: z.string(),
  emailVerified: z.boolean(),
  /** The account's own name and phone (10a); null until the customer gives them. */
  name: z.string().nullable().default(null),
  phone: z.string().nullable().default(null),
});

/** Answer to requests whose outcome must not reveal whether an email is registered. */
export const acceptedResponseSchema = z.object({ status: z.literal("accepted") });

export const okResponseSchema = z.object({ status: z.literal("ok") });

// --- Staff -----------------------------------------------------------------------------------

export const staffLoginRequestSchema = customerLoginRequestSchema;

export const staffProfileSchema = z.object({
  id: z.string(),
  email: z.string(),
  displayName: z.string(),
  isOwner: z.boolean(),
  mustChangePassword: z.boolean(),
  /** Role name, or null for the owner and for staff without a role (#5). */
  roleName: z.string().nullable(),
  /** What this person may do; the owner gets everything (D100). */
  permissions: permissionMapSchema,
});

export const changePasswordRequestSchema = z.object({
  currentPassword: loginPasswordSchema,
  newPassword: passwordSchema,
});

export const reauthenticateRequestSchema = z.object({ password: loginPasswordSchema });

export const staffSummarySchema = z.object({
  id: z.string(),
  email: z.string(),
  displayName: z.string(),
  isOwner: z.boolean(),
  isActive: z.boolean(),
  mustChangePassword: z.boolean(),
  roleId: z.string().nullable(),
  roleName: z.string().nullable(),
  lastLoginAt: z.string().nullable(),
  createdAt: z.string(),
});

export const staffListResponseSchema = z.object({ staff: z.array(staffSummarySchema) });

export const createStaffRequestSchema = z
  .object({
    email: emailSchema,
    displayName: z.string().trim().min(1).max(120),
    temporaryPassword: temporaryPasswordSchema,
  })
  .refine((value) => value.temporaryPassword.trim().toLowerCase() !== value.email, {
    path: ["temporaryPassword"],
    message: "Password must not be the email address.",
  });

export const resetStaffPasswordRequestSchema = z.object({
  temporaryPassword: temporaryPasswordSchema,
});

export type CustomerRegisterRequest = z.infer<typeof customerRegisterRequestSchema>;
export type CustomerLoginRequest = z.infer<typeof customerLoginRequestSchema>;
export type EmailRequest = z.infer<typeof emailRequestSchema>;
export type ResetPasswordRequest = z.infer<typeof resetPasswordRequestSchema>;
export type CustomerProfile = z.infer<typeof customerProfileSchema>;
export type StaffProfile = z.infer<typeof staffProfileSchema>;
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;
export type StaffSummary = z.infer<typeof staffSummarySchema>;
export type CreateStaffRequest = z.infer<typeof createStaffRequestSchema>;
