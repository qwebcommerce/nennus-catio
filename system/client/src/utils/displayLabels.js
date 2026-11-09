/** احتياط إن كان الجلسة قديماً ولم تُحمَّل حقول nameEn بعد */
const USER_EN_FALLBACK = {
  "مدير النظام": "System administrator",
  كاشير: "Cashier",
};
export const BRANCH_EN_FALLBACK = {
  "الفرع الرئيسي": "Main branch",
  "فرع الشمال": "North branch",
};

/** اسم الفرع للعرض حسب اللغة (قوائم POS وغيرها) */
export function branchDisplayName(branch, locale) {
  if (!branch) return "";
  if (locale === "en") {
    if (branch.nameEn?.trim()) return branch.nameEn.trim();
    const ar = branch.name || "";
    if (BRANCH_EN_FALLBACK[ar]) return BRANCH_EN_FALLBACK[ar];
  }
  return branch.name || "";
}

/** Branch id from the logged-in user (each login is scoped to one branch). */
export function userBranchId(user) {
  return user?.branchId ? String(user.branchId) : "";
}

/** Display name for the user's assigned branch (receipts / store identity). */
export function userBranchDisplayName(user, locale) {
  if (!user?.branchId) return "";
  if (locale === "en") {
    if (user.branchNameEn?.trim()) return user.branchNameEn.trim();
    if (user.branchName && BRANCH_EN_FALLBACK[user.branchName]) return BRANCH_EN_FALLBACK[user.branchName];
  }
  return user.branchName || "";
}

/**
 * Sidebar user line — name only (branch is fixed by login; managed under Administration).
 */
export function formatUserBranchLine(user, locale) {
  if (!user) return "";
  const en = locale === "en";
  let userName = user.name || "";
  if (en) {
    if (user.nameEn?.trim()) userName = user.nameEn.trim();
    else if (USER_EN_FALLBACK[user.name]) userName = USER_EN_FALLBACK[user.name];
  }
  return userName;
}
