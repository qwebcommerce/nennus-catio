import bcrypt from "bcryptjs";

export const SLUG_RE = /^[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?$/;

/**
 * إنشاء مؤسسة + فرع رئيسي + مدير ADMIN + إعدادات المزامنة.
 * يفترض التحقق من عدم تكرار slug والمدخلات مسبقاً.
 */
export async function bootstrapOrganization(prisma, input) {
  const {
    organizationName,
    organizationSlug,
    branchName,
    adminEmail,
    adminPassword,
    adminName,
    businessVertical,
    /** When true (platform-created orgs), skip KYC + payment gates */
    onboardingComplete = false,
  } = input;

  const name = String(organizationName).trim().slice(0, 200);
  const slugRaw = String(organizationSlug).trim().toLowerCase();
  const branchLabel =
    branchName != null && String(branchName).trim()
      ? String(branchName).trim().slice(0, 200)
      : "الفرع الرئيسي";
  const emailNorm = String(adminEmail).toLowerCase().trim();
  const passwordHash = await bcrypt.hash(String(adminPassword), 10);

  const org = await prisma.organization.create({
    data: {
      name,
      slug: slugRaw,
      plan: "FREE",
      maxBranches: 3,
      profileDocsDone: Boolean(onboardingComplete),
      paymentDone: Boolean(onboardingComplete),
      onboardingReviewStatus: onboardingComplete ? "APPROVED" : "NOT_SUBMITTED",
      ...(businessVertical != null ? { businessVertical } : {}),
    },
  });
  const branch = await prisma.branch.create({
    data: {
      organizationId: org.id,
      name: branchLabel,
      nameEn: "Main branch",
    },
  });
  const user = await prisma.user.create({
    data: {
      organizationId: org.id,
      email: emailNorm,
      passwordHash,
      name: String(adminName).trim().slice(0, 200),
      role: "ADMIN",
      branchId: branch.id,
    },
  });
  await prisma.syncSettings.create({
    data: { organizationId: org.id },
  });

  return { org, branch, user };
}
