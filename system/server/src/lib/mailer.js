import { prisma } from "./prisma.js";

const COPY = {
  en: {
    order: "Your Nennus Catio order",
    booking: "Your grooming booking",
    refund: "Your refund",
    relocation: "Your relocation request",
    alert: "Nennus Catio alert",
  },
  ar: {
    order: "طلبك من نينوس كاتيو",
    booking: "حجز التجميل",
    refund: "المبلغ المسترد",
    relocation: "طلب نقل الحيوان",
    alert: "تنبيه نينوس كاتيو",
  },
};

export async function sendMail({ to, subject, text }) {
  const key = process.env.RESEND_API_KEY?.trim();
  const from = process.env.SHOP_FROM_EMAIL?.trim();
  if (!key || !from || !to) return false;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject, text }),
  });
  return res.ok;
}

export async function mailCustomer(customer, kind, text) {
  if (!customer?.email) return;
  const lang = customer.locale === "en" ? "en" : "ar";
  await sendMail({ to: customer.email, subject: COPY[lang][kind] || COPY[lang].order, text });
}

export async function mailStaff(organizationId, flag, text) {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { notifyEmail: true, alertOrder: true, alertBooking: true, alertRelocation: true, alertLowStock: true },
  });
  if (!org?.notifyEmail || !org[flag]) return;
  await sendMail({ to: org.notifyEmail, subject: COPY.en.alert, text });
}
