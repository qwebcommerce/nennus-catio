import { z } from "zod";
import { httpsUrlSchema, internationalPhoneSchema, localisedTextSchema, toInternationalPhone } from "./site-settings.js";

/**
 * Staff roles and module permissions (branch #5, D100). Team & Access is not a permission module:
 * it stays owner-only (D95). Module ids match the admin navigation (`ModuleId` minus "team").
 */
export const PERMISSION_MODULES = [
  "dashboard",
  "orders",
  "bookings",
  /** Pet relocation requests (#15 15b, D279); its admin page comes with 15d. */
  "relocation",
  "customers",
  "products",
  "promotions",
  "deliverySlots",
  "dispatch",
  "groomingPackages",
  "groomingCalendar",
  "finance",
  "settings",
] as const;

/** Refund is only meaningful where money is taken (D76); a relocation quote is paid too (#15). */
export const REFUND_MODULES = ["orders", "bookings", "relocation"] as const;

export const PERMISSION_ACTIONS = ["view", "edit", "delete", "export", "refund"] as const;

export const permissionModuleSchema = z.enum(PERMISSION_MODULES);
export const permissionActionSchema = z.enum(PERMISSION_ACTIONS);

export const modulePermissionSchema = z.object({
  view: z.boolean(),
  edit: z.boolean(),
  delete: z.boolean(),
  export: z.boolean(),
  refund: z.boolean(),
});

/** Every module must be present, so a role is always a complete picture. */
export const permissionMapSchema = z.record(permissionModuleSchema, modulePermissionSchema);

export type PermissionModule = z.infer<typeof permissionModuleSchema>;
export type PermissionAction = z.infer<typeof permissionActionSchema>;
export type ModulePermission = z.infer<typeof modulePermissionSchema>;
export type PermissionMap = z.infer<typeof permissionMapSchema>;

const NONE: ModulePermission = { view: false, edit: false, delete: false, export: false, refund: false };
const ALL: ModulePermission = { view: true, edit: true, delete: true, export: true, refund: true };

export function isRefundModule(module: PermissionModule): boolean {
  return (REFUND_MODULES as readonly string[]).includes(module);
}

/**
 * Makes a permission map consistent: any action includes View, and Refund only exists on
 * refund modules. Used by the API before saving and by the web grid while editing.
 */
export function normalisePermissions(map: Partial<PermissionMap>): PermissionMap {
  const result = {} as PermissionMap;
  for (const module of PERMISSION_MODULES) {
    const value = { ...NONE, ...map[module] };
    if (!isRefundModule(module)) value.refund = false;
    if (value.edit || value.delete || value.export || value.refund) value.view = true;
    result[module] = value;
  }
  return result;
}

export function emptyPermissions(): PermissionMap {
  return normalisePermissions({});
}

/** The owner has every permission (D95/D100). */
export function ownerPermissions(): PermissionMap {
  return normalisePermissions(Object.fromEntries(PERMISSION_MODULES.map((module) => [module, ALL])));
}

export const roleNameSchema = z.string().trim().min(1).max(60);

export const roleSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  isStarter: z.boolean(),
  staffCount: z.number().int().nonnegative(),
  version: z.number().int().positive(),
  permissions: permissionMapSchema,
});

export const roleListResponseSchema = z.object({ roles: z.array(roleSchema) });

export const saveRoleRequestSchema = z.object({
  name: roleNameSchema,
  description: z.string().trim().max(200).default(""),
  permissions: permissionMapSchema,
});

/** Edits carry the version the editor started from; a newer version means someone else saved. */
export const updateRoleRequestSchema = saveRoleRequestSchema.extend({
  version: z.number().int().positive(),
});

export const assignRoleRequestSchema = z.object({ roleId: z.uuid().nullable() });

export type Role = z.infer<typeof roleSchema>;
export type SaveRoleRequest = z.infer<typeof saveRoleRequestSchema>;
export type UpdateRoleRequest = z.infer<typeof updateRoleRequestSchema>;

// --- Settings editor ---------------------------------------------------------------------------

/** An editable link: empty or null means "not set"; anything else must be an absolute https URL. */
const editableLinkSchema = z
  .string()
  .trim()
  .max(500)
  .nullable()
  .transform((value) => (value === "" || value === null ? null : value))
  .pipe(httpsUrlSchema.nullable());

const editableTextSchema = (max: number) =>
  z.object({ en: z.string().trim().max(max), ar: z.string().trim().max(max) });

/** An editable number (D232): empty or null means "not set"; anything else is stored in international form. */
const editablePhoneSchema = z
  .string()
  .trim()
  .max(20)
  .nullable()
  .transform((value, context) => {
    if (value === "" || value === null) return null;
    const international = toInternationalPhone(value);
    if (international === null) {
      context.addIssue({
        code: "custom",
        message: "Use a Qatari number, or add the country code with + (for example +63 912 345 6789).",
      });
      return z.NEVER;
    }
    return international;
  });

export const adminSiteSettingsSchema = z.object({
  headline: localisedTextSchema,
  description: localisedTextSchema,
  hours: localisedTextSchema,
  /** The business phone and WhatsApp number, in international form (D232). */
  contact: z.object({
    phone: internationalPhoneSchema.nullable(),
    whatsapp: internationalPhoneSchema.nullable(),
  }),
  socialLinks: z.object({
    instagram: z.string().nullable(),
    instagramGrooming: z.string().nullable(),
    instagramProjects: z.string().nullable(),
    facebook: z.string().nullable(),
  }),
  version: z.number().int().positive(),
  updatedAt: z.string(),
});

export const updateSiteSettingsRequestSchema = z.object({
  version: z.number().int().positive(),
  headline: editableTextSchema(200),
  description: editableTextSchema(500),
  hours: editableTextSchema(200),
  contact: z.object({
    phone: editablePhoneSchema,
    whatsapp: editablePhoneSchema,
  }),
  socialLinks: z.object({
    instagram: editableLinkSchema,
    instagramGrooming: editableLinkSchema,
    instagramProjects: editableLinkSchema,
    facebook: editableLinkSchema,
  }),
});

export type AdminSiteSettings = z.infer<typeof adminSiteSettingsSchema>;
export type UpdateSiteSettingsRequest = z.infer<typeof updateSiteSettingsRequestSchema>;
