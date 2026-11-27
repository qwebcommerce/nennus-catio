import { Router } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";
import { findBranchInOrg } from "../lib/orgScope.js";
import { findOrganizationOwnerId, isOrganizationOwner } from "../lib/orgOwner.js";
import { writeAudit } from "../lib/auditLog.js";
import { assertVersion, requireVersion, versionedUpdate } from "../lib/recordVersion.js";
import { authMiddleware, requireModule, requireOwner } from "../middleware/auth.js";
import { ROLES, ROLES_WITHOUT_BRANCH } from "../lib/permissions.js";

const router = Router();
router.use(authMiddleware);
/** Viewing the team needs Team → view. */
router.use(requireModule("team", "view"));
/** FR-07 / FR-09: creating staff, assigning a role and deactivating are reserved for the owner. */
router.use((req, res, next) => (req.method === "GET" ? next() : requireOwner(req, res, next)));

/**
 * Most active staff accounts an organisation may have (owner decision: 30). MAX_ACTIVE_USERS
 * overrides it; a missing or invalid value (not a whole number of at least 1) keeps 30.
 * Only active users count: a deactivated account frees its seat.
 */
export function maxActiveUsers() {
  const raw = String(process.env.MAX_ACTIVE_USERS ?? "").trim();
  if (/^\d+$/.test(raw)) {
    const n = Number(raw);
    if (Number.isSafeInteger(n) && n >= 1) return n;
  }
  return 30;
}

function userLimitError(res, maxUsers) {
  return err(res, 403, `تم بلوغ الحد الأقصى للمستخدمين النشطين (${maxUsers})`, `Active user limit reached (${maxUsers})`, {
    code: "USER_LIMIT",
    maxUsers,
  });
}

/** Roles that may work business-wide; the others need a location (e.g. a van for a driver). */
const needsBranch = (role) => !ROLES_WITHOUT_BRANCH.includes(String(role));

const userSelect = {
  id: true,
  email: true,
  name: true,
  nameEn: true,
  role: true,
  active: true,
  branchId: true,
  branch: { select: { name: true, nameEn: true } },
  createdAt: true,
  version: true,
};

function err(res, status, ar, en, extra = {}) {
  return res.status(status).json({ error: ar, errorAr: ar, errorEn: en, ...extra });
}

router.get("/", async (req, res) => {
  const orgId = req.user.organizationId;
  const [users, ownerId] = await Promise.all([
    prisma.user.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: "asc" },
      select: userSelect,
    }),
    findOrganizationOwnerId(prisma, orgId),
  ]);
  const maxUsers = maxActiveUsers();
  res.json({
    users: users.map((u) => ({
      ...u,
      isOrgOwner: u.id === ownerId,
    })),
    maxUsers,
    userCount: users.filter((u) => u.active).length,
    ownerId,
  });
});

router.post("/", async (req, res) => {
  const { email, password, name, nameEn, role, branchId } = req.body || {};
  if (!email?.trim() || !password || !name?.trim()) {
    return err(res, 400, "البريد والاسم وكلمة المرور مطلوبة", "Email, name and password are required");
  }
  if (String(password).length < 6) {
    return err(res, 400, "كلمة المرور يجب ألا تقل عن 6 أحرف", "Password must be at least 6 characters");
  }
  if (!ROLES.includes(String(role))) {
    return err(res, 400, "دور غير صالح", "Invalid role");
  }
  const roleStr = String(role);
  const resolvedBranchId = branchId != null && String(branchId).trim() ? String(branchId).trim() : null;
  if (needsBranch(roleStr) && !resolvedBranchId) {
    return err(res, 400, "يجب تعيين فرع للمستخدم", "Assign a branch to this user");
  }
  if (resolvedBranchId) {
    const b = await findBranchInOrg(prisma, req.user.organizationId, resolvedBranchId);
    if (!b) return err(res, 400, "فرع غير صالح", "Invalid branch");
  }

  const maxUsers = maxActiveUsers();
  const userCount = await prisma.user.count({ where: { organizationId: req.user.organizationId, active: true } });
  if (userCount >= maxUsers) return userLimitError(res, maxUsers);

  try {
    const hash = await bcrypt.hash(String(password), 10);
    const user = await prisma.$transaction(async (tx) => {
      const row = await tx.user.create({
        data: {
          organizationId: req.user.organizationId,
          email: String(email).toLowerCase().trim(),
          passwordHash: hash,
          name: name.trim(),
          nameEn: nameEn?.trim() || null,
          role: roleStr,
          branchId: resolvedBranchId,
        },
        select: userSelect,
      });
      await writeAudit(
        {
          userId: req.user.sub,
          action: "USER_CREATE",
          entityType: "User",
          entityId: row.id,
          branchId: req.user.branchId || null,
          summary: `Created staff user ${row.email} as ${row.role}`,
          meta: { email: row.email, role: row.role, branchId: row.branchId },
        },
        tx
      );
      return row;
    });
    res.status(201).json({ ...user, isOrgOwner: false });
  } catch (e) {
    if (e?.code === "P2002") {
      return err(res, 409, "البريد مسجّل مسبقاً في هذه المؤسسة", "This email is already used in this organisation", {
        code: "EMAIL_TAKEN",
      });
    }
    throw e;
  }
});

async function loadTarget(req, res) {
  const target = await prisma.user.findFirst({
    where: { id: req.params.id, organizationId: req.user.organizationId },
  });
  if (!target) {
    err(res, 404, "غير موجود", "Not found");
    return null;
  }
  if (await isOrganizationOwner(prisma, req.user.organizationId, target.id)) {
    err(res, 403, "لا يمكن تعديل حساب مالك المؤسسة (المشرف الأعلى)", "The owner account cannot be changed here", {
      code: "ORG_OWNER_LOCKED",
    });
    return null;
  }
  return target;
}

router.patch("/:id", async (req, res) => {
  const { name, nameEn, role, branchId, password, active } = req.body || {};
  const version = requireVersion(req);
  const target = await loadTarget(req, res);
  if (!target) return;
  assertVersion(target, version);

  if (branchId !== undefined && branchId) {
    const b = await findBranchInOrg(prisma, req.user.organizationId, branchId);
    if (!b) return err(res, 400, "فرع غير صالح", "Invalid branch");
  }
  if (role !== undefined && role !== null && role !== "" && !ROLES.includes(String(role))) {
    return err(res, 400, "دور غير صالح", "Invalid role");
  }
  const data = {};
  if (name != null) data.name = String(name).trim();
  if (nameEn !== undefined) data.nameEn = nameEn?.trim() || null;
  if (role && ROLES.includes(String(role))) data.role = String(role);
  if (branchId !== undefined) data.branchId = branchId || null;
  if (typeof active === "boolean") {
    if (target.id === req.user.sub && !active) {
      return err(res, 400, "لا يمكن تعطيل حسابك الحالي", "You cannot deactivate your own account");
    }
    data.active = active;
  }
  const nextRole = data.role || target.role;
  const nextBranch = branchId !== undefined ? branchId || null : target.branchId;
  if (needsBranch(nextRole) && !nextBranch) {
    return err(res, 400, "يجب تعيين فرع للمستخدم", "Assign a branch to this user");
  }
  if (password) {
    if (String(password).length < 6) {
      return err(res, 400, "كلمة المرور يجب ألا تقل عن 6 أحرف", "Password must be at least 6 characters");
    }
    data.passwordHash = await bcrypt.hash(String(password), 10);
  }
  if (data.active === true && !target.active) {
    const maxUsers = maxActiveUsers();
    const count = await prisma.user.count({ where: { organizationId: req.user.organizationId, active: true } });
    if (count >= maxUsers) return userLimitError(res, maxUsers);
  }
  // A role change also ends the user's sessions, so their menus and rights reload at sign-in.
  const roleChanged = Boolean(data.role && data.role !== target.role);
  if (data.passwordHash || data.active === false || roleChanged) data.sessionVersion = { increment: 1 };
  if (!Object.keys(data).length) return err(res, 400, "لا توجد تغييرات", "Nothing to update");

  const user = await prisma.$transaction(async (tx) => {
    const row = await versionedUpdate(tx, "user", { id: target.id, version, data, select: userSelect });
    const changes = {};
    if (data.role && data.role !== target.role) changes.role = { from: target.role, to: data.role };
    if (data.branchId !== undefined && data.branchId !== target.branchId) changes.branchId = { from: target.branchId, to: data.branchId };
    if (data.active !== undefined && data.active !== target.active) changes.active = { from: target.active, to: data.active };
    if (data.name !== undefined && data.name !== target.name) changes.name = { from: target.name, to: data.name };
    if (data.passwordHash) changes.password = "changed";
    let action = "USER_UPDATE";
    if (changes.active) action = data.active ? "USER_REACTIVATE" : "USER_DEACTIVATE";
    else if (changes.role) action = "USER_ROLE_CHANGE";
    await writeAudit(
      {
        userId: req.user.sub,
        action,
        entityType: "User",
        entityId: target.id,
        branchId: req.user.branchId || null,
        summary: `${action} ${target.email}`,
        meta: changes,
      },
      tx
    );
    return row;
  });
  res.json({ ...user, isOrgOwner: false });
});

async function setActive(req, res, active) {
  const target = await loadTarget(req, res);
  if (!target) return;
  if (!active && target.id === req.user.sub) {
    return err(res, 400, "لا يمكن تعطيل حسابك الحالي", "You cannot deactivate your own account");
  }
  if (active) {
    const maxUsers = maxActiveUsers();
    const count = await prisma.user.count({ where: { organizationId: req.user.organizationId, active: true } });
    if (!target.active && count >= maxUsers) return userLimitError(res, maxUsers);
  }
  const user = await prisma.$transaction(async (tx) => {
    const row = await tx.user.update({
      where: { id: target.id },
      data: active ? { active: true } : { active: false, sessionVersion: { increment: 1 } },
      select: userSelect,
    });
    await writeAudit(
      {
        userId: req.user.sub,
        action: active ? "USER_REACTIVATE" : "USER_DEACTIVATE",
        entityType: "User",
        entityId: target.id,
        branchId: req.user.branchId || null,
        summary: `${active ? "Reactivated" : "Deactivated"} ${target.email}`,
        meta: { active: { from: target.active, to: active } },
      },
      tx
    );
    return row;
  });
  return res.json({ ...user, isOrgOwner: false });
}

router.post("/:id/deactivate", (req, res) => setActive(req, res, false));
router.post("/:id/reactivate", (req, res) => setActive(req, res, true));

/**
 * Staff are never hard-deleted: their sales, refunds and audit rows must keep their author.
 * DELETE is kept for old clients and deactivates the account instead.
 */
router.delete("/:id", (req, res) => setActive(req, res, false));

export default router;
