/** Status enums shown to people, in English and Arabic (NFR-01, FR-37, FR-52, FR-63). */
const LABELS = {
  order: {
    PENDING_PAYMENT: ["Awaiting payment", "بانتظار الدفع"],
    CONFIRMED: ["Confirmed", "مؤكد"],
    PREPARING: ["Preparing", "قيد التجهيز"],
    OUT_FOR_DELIVERY: ["Out for delivery", "خرج للتوصيل"],
    READY_FOR_PICKUP: ["Ready for pickup", "جاهز للاستلام"],
    DELIVERED: ["Delivered", "تم التوصيل"],
    COLLECTED: ["Collected", "تم الاستلام"],
    CANCELLED: ["Cancelled", "ملغى"],
  },
  booking: {
    BOOKED: ["Booked", "محجوز"],
    PENDING_PAYMENT: ["Awaiting payment", "بانتظار الدفع"],
    CONFIRMED: ["Confirmed", "مؤكد"],
    CHECKED_IN: ["Checked in", "تم تسجيل الوصول"],
    IN_PROGRESS: ["In progress", "قيد التنفيذ"],
    DONE: ["Done", "منجز"],
    NO_SHOW: ["No show", "لم يحضر"],
    CANCELLED: ["Cancelled", "ملغى"],
  },
  relocation: {
    SUBMITTED: ["Submitted", "تم الإرسال"],
    DOCUMENTS_REQUESTED: ["Documents requested", "مطلوب مستندات"],
    DOCUMENTS_RECEIVED: ["Documents received", "تم استلام المستندات"],
    UNDER_REVIEW: ["Under review", "قيد المراجعة"],
    QUOTE_SENT: ["Quote sent", "تم إرسال عرض السعر"],
    PAID: ["Paid", "مدفوع"],
    IN_PROGRESS: ["In progress", "قيد التنفيذ"],
    COMPLETED: ["Completed", "مكتمل"],
    CANCELLED: ["Cancelled", "ملغى"],
  },
  bill: {
    OPEN: ["Open", "مفتوحة"],
    PARTIAL: ["Part paid", "مدفوعة جزئياً"],
    PAID: ["Paid", "مدفوعة"],
  },
  purchaseOrder: {
    DRAFT: ["Draft", "مسودة"],
    SENT: ["Sent", "مُرسل"],
    PARTIALLY_RECEIVED: ["Partly received", "استلام جزئي"],
    RECEIVED: ["Received", "تم الاستلام"],
    CANCELLED: ["Cancelled", "ملغى"],
  },
  channel: {
    IN_STORE: ["In-store", "المتجر"],
    VAN: ["Van", "الفان"],
    WEBSITE: ["Website", "الموقع"],
    GROOMING: ["Grooming", "التجميل"],
    RELOCATION: ["Relocation", "نقل الحيوانات"],
    SALES_ORDER: ["B2B / sales orders", "طلبات البيع (B2B)"],
  },
  fulfillment: {
    DELIVERY: ["Delivery", "توصيل"],
    PICKUP: ["Pickup", "استلام من المتجر"],
  },
  payment: {
    CASH: ["Cash", "نقداً"],
    CARD: ["Card", "بطاقة"],
    ONLINE: ["Online", "إلكتروني"],
    FAWRAN: ["Fawran", "فوران"],
    PAYMENT_LINK: ["Payment link", "رابط دفع"],
    SPLIT: ["Split", "مقسّم"],
    ON_DELIVERY: ["On delivery", "عند الاستلام"],
    ON_ACCOUNT: ["On account", "على الحساب"],
    BANK: ["Bank", "البنك"],
    BANK_TRANSFER: ["Bank transfer", "تحويل بنكي"],
  },
  salesOrder: {
    DRAFT: ["Draft", "مسودة"],
    CONFIRMED: ["Confirmed", "مؤكد"],
    PARTLY_DELIVERED: ["Part delivered", "مُسلَّم جزئياً"],
    DELIVERED: ["Delivered", "مُسلَّم"],
    COMPLETED: ["Completed", "مكتمل"],
    CANCELLED: ["Cancelled", "ملغى"],
  },
  paidStatus: {
    UNPAID: ["Unpaid", "غير مدفوع"],
    PART_PAID: ["Part paid", "مدفوع جزئياً"],
    PAID: ["Paid", "مدفوع"],
  },
  pendingKind: {
    SALES_ORDER: ["Sales-order installment", "دفعة طلب بيع"],
    ON_ACCOUNT: ["On-account balance", "رصيد على الحساب"],
    SUPPLIER_BILL: ["Supplier bill", "فاتورة مورد"],
    FREIGHT_BILL: ["Freight bill", "فاتورة شحن"],
    VAN_RETURN: ["Van return (owed to customer)", "مرتجع سيارة (مستحق للعميل)"],
  },
  billKind: {
    GOODS: ["Goods", "بضاعة"],
    FREIGHT: ["Freight", "شحن"],
  },
  payStatus: {
    PENDING: ["Pending", "قيد الانتظار"],
    CAPTURED: ["Received", "مستلم"],
    REJECTED: ["Rejected", "مرفوض"],
    REVIEW: ["Needs review", "بحاجة لمراجعة"],
    FAILED: ["Failed", "فشل"],
    REFUNDED: ["Refunded", "مسترد"],
  },
  txType: {
    SALE: ["Sale", "بيع"],
    REFUND: ["Refund", "استرجاع"],
    PAYMENT: ["Payment", "دفعة"],
  },
};

/** statusLabel("order", "CONFIRMED", "ar") → "مؤكد". Unknown values fall back to a readable form. */
export function statusLabel(kind, value, locale) {
  if (value == null || value === "") return "";
  const row = LABELS[kind]?.[value];
  if (row) return locale === "en" ? row[0] : row[1];
  return String(value).replace(/_/g, " ").toLowerCase();
}
