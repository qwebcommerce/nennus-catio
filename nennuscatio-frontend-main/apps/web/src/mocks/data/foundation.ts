import type {
  FoundationArea,
  FoundationAreaId,
  LocalisedText,
  SiteContent,
} from "@nennus-catio/contracts";

const text = (en: string, ar: string): LocalisedText => ({ en, ar });
export const siteContent: SiteContent = {
  brand: text("Nennus Catio", "Nennus Catio"),
  description: text("Shop and grooming in Qatar", "المتجر والعناية في قطر"),
  currency: "QAR",
  timeZone: "Asia/Qatar",
  socialLinks: { instagram: null, facebook: null, whatsapp: null },
};
const shopSteps = [
  text("Category", "الفئة"),
  text("Pet type", "نوع الحيوان"),
  text("Product & options", "المنتج والخيارات"),
  text("Cart", "السلة"),
];
const groomingSteps = [
  text("Pet category", "فئة الحيوان"),
  text("Basic or Full", "أساسية أو كاملة"),
  text("Date & time", "التاريخ والوقت"),
  text("Payment & booking", "الدفع والحجز"),
];
export const foundationAreas: Readonly<
  Record<FoundationAreaId, FoundationArea>
> = {
  shop: { id: "shop", readyInPhase: 3, steps: shopSteps },
  cart: {
    id: "cart",
    readyInPhase: 3,
    steps: [
      text("Selected items", "العناصر المختارة"),
      text("Guest checkout", "إتمام الطلب كضيف"),
    ],
  },
  grooming: { id: "grooming", readyInPhase: 4, steps: groomingSteps },
  dashboard: {
    id: "dashboard",
    readyInPhase: 5,
    steps: [
      text("Operational overview", "نظرة تشغيلية"),
      text("Schedule & actions", "الجدول والإجراءات"),
    ],
  },
  products: {
    id: "products",
    readyInPhase: 5,
    steps: [
      text("Category & pet assignment", "تعيين الفئة والحيوان"),
      text(
        "Bilingual product & SKU management",
        "إدارة المنتجات ووحداتها باللغتين",
      ),
    ],
  },
  promotions: {
    id: "promotions",
    readyInPhase: 5,
    steps: [
      text("Reference concept only", "تصور مرجعي فقط"),
      text("No active discounts", "لا خصومات نشطة"),
    ],
  },
  orders: {
    id: "orders",
    readyInPhase: 5,
    steps: [
      text("Order list & details", "قائمة الطلبات وتفاصيلها"),
      text("Fulfilment status", "حالة تنفيذ الطلب"),
    ],
  },
  dispatch: {
    id: "dispatch",
    readyInPhase: 5,
    steps: [
      text("Reference concept only", "تصور مرجعي فقط"),
      text("No driver assignment", "لا تعيين للسائقين"),
    ],
  },
  relocation: {
    id: "relocation",
    readyInPhase: 5,
    steps: [
      text("Requests and documents", "الطلبات والمستندات"),
      text("Quotes and payments", "عروض الأسعار والمدفوعات"),
    ],
  },
  deliverySlots: {
    id: "deliverySlots",
    readyInPhase: 5,
    steps: [
      text("Manual delivery windows", "فترات توصيل يدوية"),
      text("Independent delivery capacity", "سعة توصيل مستقلة"),
    ],
  },
  groomingPackages: {
    id: "groomingPackages",
    readyInPhase: 5,
    steps: [
      text("Four categories × Basic / Full", "أربع فئات × أساسية / كاملة"),
      text("Independent price, duration & content", "سعر ومدة ومحتوى مستقل"),
    ],
  },
  groomingCalendar: {
    id: "groomingCalendar",
    readyInPhase: 5,
    steps: [
      text("Manual availability", "إتاحة يدوية"),
      text("Calendar & booking list", "تقويم وقائمة حجوزات"),
    ],
  },
  bookings: {
    id: "bookings",
    readyInPhase: 5,
    steps: [
      text("Booking details & status", "تفاصيل الحجز وحالته"),
      text("Linked calendar availability", "إتاحة تقويم مرتبطة"),
    ],
  },
  customers: {
    id: "customers",
    readyInPhase: 5,
    steps: [
      text("Guest contact information", "معلومات تواصل الضيوف"),
      text("Associated orders & bookings", "طلبات وحجوزات مرتبطة"),
    ],
  },
  finance: {
    id: "finance",
    readyInPhase: 5,
    steps: [
      text("Agreed financial information", "معلومات مالية معتمدة"),
      text("View & export only", "عرض وتصدير فقط"),
    ],
  },
  settings: {
    id: "settings",
    readyInPhase: 5,
    steps: [
      text("Bilingual content & contacts", "المحتوى والتواصل باللغتين"),
      text("Admin-managed social links", "روابط تواصل تديرها الإدارة"),
    ],
  },
  integrations: {
    id: "integrations",
    readyInPhase: 5,
    steps: [
      text("POS keys and their rights", "مفاتيح نظام نقطة البيع وصلاحياتها"),
      text("Owner-only alerts", "تنبيهات للمالك فقط"),
    ],
  },
  team: {
    id: "team",
    readyInPhase: 5,
    steps: [
      text("Individual employee accounts", "حسابات موظفين فردية"),
      text("Owner-only management", "إدارة للمالك فقط"),
    ],
  },
};
