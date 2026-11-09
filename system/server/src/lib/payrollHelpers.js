import { Prisma } from "./prisma-client-bundle.js";

export function roundMoney(n) {
  return Math.round(n * 100) / 100;
}

/**
 * صافي = أساسي + بدلات − خصومات − خصم سلف
 */
export function computeNet(base, allowances, deductions, loanDeduction) {
  const b = Number(base) || 0;
  const a = Number(allowances) || 0;
  const d = Number(deductions) || 0;
  const l = Number(loanDeduction) || 0;
  return roundMoney(Math.max(0, b + a - d - l));
}

/**
 * تطبيق خصم السلف على القروض المفتوحة (الأقدم أولاً)
 * @param {import("@prisma/client").Prisma.TransactionClient} tx
 */
export async function applyLoanDeductionForLine(tx, organizationId, line) {
  let remaining = roundMoney(Number(line.loanDeduction));
  if (remaining <= 0) return;

  const loans = await tx.employeeLoan.findMany({
    where: {
      employeeId: line.employeeId,
      organizationId,
      status: "OPEN",
    },
    orderBy: { createdAt: "asc" },
  });

  for (const loan of loans) {
    if (remaining <= 0) break;
    const principal = Number(loan.principal);
    const paid = Number(loan.paidAmount);
    const owed = roundMoney(principal - paid);
    if (owed <= 0) continue;
    const take = Math.min(remaining, owed);
    await tx.loanRepayment.create({
      data: {
        employeeLoanId: loan.id,
        amount: new Prisma.Decimal(take.toFixed(2)),
        payrollLineId: line.id,
        note: "خصم من راتب",
      },
    });
    const newPaid = roundMoney(paid + take);
    await tx.employeeLoan.update({
      where: { id: loan.id },
      data: {
        paidAmount: new Prisma.Decimal(newPaid.toFixed(2)),
        status: newPaid >= principal - 0.009 ? "SETTLED" : "OPEN",
      },
    });
    remaining = roundMoney(remaining - take);
  }

  if (remaining > 0.02) {
    throw new Error(
      `مجموع السلف المفتوحة لا يغطي خصم الراتب (${remaining.toFixed(2)} متبقي)`,
    );
  }
}

/** Total still owed on OPEN loans for an employee. */
export async function openLoanBalance(db, organizationId, employeeId) {
  const loans = await db.employeeLoan.findMany({
    where: { organizationId, employeeId, status: "OPEN" },
    select: { principal: true, paidAmount: true },
  });
  let owed = 0;
  for (const loan of loans) {
    owed += Math.max(0, Number(loan.principal) - Number(loan.paidAmount));
  }
  return roundMoney(owed);
}
