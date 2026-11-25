import { Prisma } from "./prisma-client-bundle.js";
import { fmt, riyals } from "./money.js";

/**
 * NFR-03: every money column, stored as whole dirhams (Int). Non-money decimals (quantities,
 * weights, percentages, rates, dimensions, coordinates) stay Decimal and are not listed.
 * Keep in step with prisma/schema.prisma and migration 20261118103000_money_dirhams.
 */
export const MONEY_FIELDS = {
  Organization: ["homeVisitFee"],
  OrganizationPlanPurchase: ["amount"],
  Expense: ["amount"],
  Employee: ["defaultBaseSalary"],
  PayrollLine: ["baseAmount", "allowancesTotal", "deductionsTotal", "loanDeduction", "netAmount"],
  EmployeeLoan: ["principal", "paidAmount"],
  LoanRepayment: ["amount"],
  Customer: ["lifetimeSpend", "accountBalance", "creditLimit"],
  CustomerAccountLedger: ["amount"],
  LoyaltyProgramSettings: ["earnEveryAmount", "minOrderForEarn"],
  Coupon: ["minOrderAmount", "maxDiscountAmount"],
  JournalLine: ["debit", "credit"],
  CommissionEntry: ["baseAmount", "commissionAmount"],
  GroomingService: ["price"],
  Product: ["price", "wholesalePrice", "cost", "houseDeliveryFee"],
  Inventory: ["unitCost"],
  Appointment: ["homeFee", "amount", "amountPaid"],
  Sale: [
    "deliveryFee",
    "promotionDiscount",
    "total",
    "discountAmount",
    "taxAmount",
    "couponDiscountAmount",
    "loyaltyDiscountAmount",
    "loyaltyEligibleBase",
    "amountPaid",
    "amountDue",
  ],
  HeldCart: ["subtotal"],
  CashSession: ["openingFloat", "closingCountedCash", "expectedCash", "cashVariance", "cardTotal"],
  Refund: ["total"],
  RefundItem: ["unitPrice", "subtotal", "costAmount"],
  PurchaseItem: ["unitCost", "subtotal"],
  PurchaseDraftItem: ["unitCost"],
  PromoDraftItem: ["currentPrice", "cost", "suggestedPrice", "previousPrice"],
  SaleItem: ["unitPrice", "subtotal", "discountAmount", "unitCost", "costAmount"],
  InventoryLot: ["unitCost"],
  ProductVariant: ["price"],
  VariantStock: ["unitCost"],
  PurchaseOrderLine: ["unitCost"],
  SupplierBill: ["amount", "amountPaid", "freightCapitalised", "freightExpensed"],
  SupplierPayment: ["amount"],
  DeliveryArea: ["fee"],
  RelocationRequest: ["quoteAmount", "amountPaid"],
  Promotion: ["amount", "bundlePrice", "minOrderAmount"],
  Payment: ["amount"],
  // Sales orders, supplier prepayments (migration 20261126100000_sales_orders_payments).
  SalesOrder: ["subtotal", "discountAmount", "total", "amountPaid", "deliveredRevenue"],
  SalesOrderLine: ["listPrice", "unitPrice", "subtotal", "discountShare"],
  SalesOrderInstallment: ["amount", "amountPaid"],
  SalesOrderPayment: ["amount"],
  SalesOrderDelivery: ["revenue", "cost", "complimentaryCost"],
  SalesOrderDeliveryLine: ["revenue", "unitCost", "costAmount"],
  SupplierPrepayment: ["amount", "amountApplied"],
  SupplierPrepaymentApplication: ["amount"],
};

const MONEY = new Map(Object.entries(MONEY_FIELDS).map(([model, fields]) => [model, new Set(fields)]));

/** model name → { field → related model name } from the Prisma datamodel. */
const RELATIONS = new Map(
  Prisma.dmmf.datamodel.models.map((model) => [
    model.name,
    new Map(model.fields.filter((f) => f.kind === "object").map((f) => [f.name, f.type])),
  ]),
);

/** Sale.paymentSplits JSON rows store { method, amount } with amount in dirhams. */
export function splitsToApi(splits) {
  let rows = splits;
  if (typeof rows === "string") {
    try {
      rows = JSON.parse(rows);
    } catch {
      return splits;
    }
  }
  if (!Array.isArray(rows)) return splits;
  return rows.map((row) =>
    row && typeof row === "object" && Number.isInteger(Number(row.amount)) && row.amount != null && row.amount !== ""
      ? { ...row, amount: riyals(row.amount) }
      : row,
  );
}

/**
 * Response boundary: copies a Prisma result (a row, an array of rows, nested includes) of the
 * given model with every money field turned from dirhams into a riyal string with two decimals
 * ("12.50"), the shape Decimal columns always had in JSON. Other keys are kept as they are.
 * Call it once on data straight from Prisma — never on a value already converted.
 */
export function toApi(model, data) {
  if (data == null) return data;
  if (Array.isArray(data)) return data.map((row) => toApi(model, row));
  if (typeof data !== "object" || data instanceof Date || Buffer.isBuffer(data)) return data;
  const money = MONEY.get(model);
  const relations = RELATIONS.get(model);
  if (!money && !relations) return data;
  const out = {};
  for (const [key, value] of Object.entries(data)) {
    if (money?.has(key)) out[key] = typeof value === "number" || typeof value === "bigint" ? fmt(value) : value;
    else if (model === "Sale" && key === "paymentSplits") out[key] = splitsToApi(value);
    else if (relations?.has(key) && value && typeof value === "object") out[key] = toApi(relations.get(key), value);
    else if (key === "_count" || key === "_sum" || key === "_avg" || key === "_min" || key === "_max") {
      out[key] = key === "_count" || !value ? value : toApi(model, value);
    } else out[key] = value;
  }
  return out;
}

/** True when model.field is a money column (whole dirhams). */
export function isMoneyField(model, field) {
  return MONEY.get(model)?.has(field) || false;
}
