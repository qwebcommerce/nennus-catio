/** Synthetic payment evidence for the frontend. Replace with payment API DTOs. */
export type FinanceMethod = "card" | "bank-transfer" | "cod" | "cash";
export interface FinanceEvidence {
  method: FinanceMethod;
  paymentReference?: string;
  refund?: { reference: string; amount: number; hoursAfterPayment: number };
}
export const financeEvidence: Record<string, FinanceEvidence> = {
  "FO-1001": { method: "card", paymentReference: "DEMO-PAY-1001" },
  "FO-1002": { method: "cod", paymentReference: "DEMO-PAY-1002" },
  "FO-1003": { method: "bank-transfer", paymentReference: "DEMO-PAY-1003" },
  "FO-1004": { method: "card", paymentReference: "DEMO-PAY-1004" },
  "FO-1005": { method: "card", paymentReference: "DEMO-PAY-1005" },
  "FO-1006": { method: "cash", paymentReference: "DEMO-PAY-1006" },
  "FO-1007": { method: "card", paymentReference: "DEMO-PAY-1007" },
  "FO-1008": { method: "cod", paymentReference: "DEMO-PAY-1008" },
  "FO-1009": { method: "card", paymentReference: "DEMO-PAY-1009" },
  "FO-1010": { method: "bank-transfer", paymentReference: "DEMO-PAY-1010" },
  "FO-1011": { method: "bank-transfer" },
  // Explicit historical refunds, not refunds inferred from cancellation.
  "FO-1012": { method: "card", paymentReference: "DEMO-PAY-1012",
    refund: { reference: "DEMO-REF-1012", amount: 8400, hoursAfterPayment: 4 } },
  "GB-2001": { method: "card", paymentReference: "DEMO-PAY-2001" },
  "GB-2002": { method: "cash", paymentReference: "DEMO-PAY-2002" },
  "GB-2003": { method: "card", paymentReference: "DEMO-PAY-2003" },
  "GB-2004": { method: "card", paymentReference: "DEMO-PAY-2004" },
  "GB-2005": { method: "bank-transfer", paymentReference: "DEMO-PAY-2005" },
  "GB-2006": { method: "card", paymentReference: "DEMO-PAY-2006" },
  "GB-2007": { method: "card" },
  "GB-2008": { method: "card", paymentReference: "DEMO-PAY-2008",
    refund: { reference: "DEMO-REF-2008", amount: 19000, hoursAfterPayment: 4 } },
};
