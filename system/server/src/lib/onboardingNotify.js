/**
 * Notify org owner when onboarding is approved or rejected.
 * Always logs + writes audit. Optional email / WhatsApp via env webhooks.
 *
 * Env (all optional for feedback MVP):
 * - ONBOARDING_NOTIFY_WEBHOOK_URL — POST JSON { event, channels, org, message }
 * - RESEND_API_KEY + ONBOARDING_NOTIFY_FROM_EMAIL — send email via Resend
 * - ONBOARDING_NOTIFY_EMAIL — force a copy of all notices to this address (platform ops)
 */

import { writeAudit } from "./auditLog.js";

function appPublicUrl() {
  const raw =
    process.env.APP_PUBLIC_URL ||
    process.env.CLIENT_URL ||
    "http://localhost:5173";
  const withProto = String(raw).startsWith("http") ? String(raw) : `https://${raw}`;
  return withProto.replace(/\/$/, "");
}

export function buildOnboardingNotice({ org, event, note, adminEmail }) {
  const isReject = event === "rejected";
  const loginUrl = `${appPublicUrl()}/login`;
  const subject = isReject
    ? `ICODO — Application needs updates (${org.name || org.id})`
    : `ICODO — Application approved (${org.name || org.id})`;

  const bodyEn = isReject
    ? [
        `Hello${org.ownerFullName ? ` ${org.ownerFullName}` : ""},`,
        ``,
        `Your ICODO registration for "${org.name}" was not approved yet.`,
        note ? `Reason: ${note}` : null,
        ``,
        `Please sign in and resubmit your documents: ${loginUrl}`,
        ``,
        `— ICODO team`,
      ]
        .filter((l) => l != null)
        .join("\n")
    : [
        `Hello${org.ownerFullName ? ` ${org.ownerFullName}` : ""},`,
        ``,
        `Your ICODO registration for "${org.name}" is approved. You can sign in and use the system: ${loginUrl}`,
        note ? `Note: ${note}` : null,
        ``,
        `— ICODO team`,
      ]
        .filter((l) => l != null)
        .join("\n");

  const bodyAr = isReject
    ? [
        `مرحباً${org.ownerFullName ? ` ${org.ownerFullName}` : ""}،`,
        ``,
        `طلب تسجيل "${org.name}" على ICODO يحتاج تصحيحاً.`,
        note ? `السبب: ${note}` : null,
        ``,
        `سجّل الدخول وأعد إرسال المستندات: ${loginUrl}`,
        ``,
        `— فريق ICODO`,
      ]
        .filter((l) => l != null)
        .join("\n")
    : [
        `مرحباً${org.ownerFullName ? ` ${org.ownerFullName}` : ""}،`,
        ``,
        `تمت الموافقة على تسجيل "${org.name}" في ICODO. يمكنك الدخول واستخدام النظام: ${loginUrl}`,
        note ? `ملاحظة: ${note}` : null,
        ``,
        `— فريق ICODO`,
      ]
        .filter((l) => l != null)
        .join("\n");

  const whatsappText = `${bodyAr}\n\n---\n${bodyEn}`;

  return {
    event,
    subject,
    bodyEn,
    bodyAr,
    whatsappText,
    emailTo: adminEmail || null,
    phoneTo: org.ownerPhone || null,
    loginUrl,
  };
}

async function postWebhook(url, payload) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Webhook ${res.status}: ${text.slice(0, 200)}`);
  }
}

async function sendResendEmail({ to, subject, text }) {
  const key = process.env.RESEND_API_KEY?.trim();
  const from =
    process.env.ONBOARDING_NOTIFY_FROM_EMAIL?.trim() || "ICODO <onboarding@icodo.app>";
  if (!key || !to) return { skipped: true, reason: "resend_not_configured" };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      text,
    }),
  });
  if (!res.ok) {
    const textBody = await res.text().catch(() => "");
    throw new Error(`Resend ${res.status}: ${textBody.slice(0, 200)}`);
  }
  return { ok: true, provider: "resend" };
}

/**
 * @returns {Promise<{ logged: boolean, email?: object, webhook?: object, channels: string[] }>}
 */
export async function notifyOnboardingDecision({
  org,
  event,
  note,
  adminEmail,
  actorUserId,
}) {
  const notice = buildOnboardingNotice({ org, event, note, adminEmail });
  const channels = [];
  const result = { logged: true, channels, notice };

  console.info("[onboarding-notify]", {
    event,
    orgId: org.id,
    emailTo: notice.emailTo,
    phoneTo: notice.phoneTo,
    subject: notice.subject,
  });

  try {
    await writeAudit({
      userId: actorUserId || null,
      action: event === "rejected" ? "ONBOARDING_REJECT_NOTIFY" : "ONBOARDING_APPROVE_NOTIFY",
      entityType: "Organization",
      entityId: org.id,
      summary: `${event}: ${notice.subject}`,
      meta: {
        emailTo: notice.emailTo,
        phoneTo: notice.phoneTo,
        note: note || null,
      },
    });
  } catch (e) {
    console.warn("[onboarding-notify] audit failed", e?.message || e);
  }

  const webhook = process.env.ONBOARDING_NOTIFY_WEBHOOK_URL?.trim();
  if (webhook) {
    try {
      await postWebhook(webhook, {
        source: "icodo-onboarding",
        event,
        org: {
          id: org.id,
          name: org.name,
          ownerFullName: org.ownerFullName,
          ownerPhone: org.ownerPhone,
        },
        emailTo: notice.emailTo,
        phoneTo: notice.phoneTo,
        subject: notice.subject,
        messageAr: notice.bodyAr,
        messageEn: notice.bodyEn,
        whatsappText: notice.whatsappText,
        loginUrl: notice.loginUrl,
      });
      result.webhook = { ok: true };
      channels.push("webhook");
      if (notice.phoneTo) channels.push("whatsapp_via_webhook");
    } catch (e) {
      result.webhook = { ok: false, error: e?.message || String(e) };
      console.warn("[onboarding-notify] webhook failed", result.webhook.error);
    }
  }

  const opsCopy = process.env.ONBOARDING_NOTIFY_EMAIL?.trim();
  const emailTargets = [...new Set([notice.emailTo, opsCopy].filter(Boolean))];
  if (emailTargets.length && process.env.RESEND_API_KEY?.trim()) {
    result.email = [];
    for (const to of emailTargets) {
      try {
        const sent = await sendResendEmail({
          to,
          subject: notice.subject,
          text: `${notice.bodyAr}\n\n---\n${notice.bodyEn}`,
        });
        result.email.push({ to, ...sent });
        if (!sent.skipped) channels.push("email");
      } catch (e) {
        result.email.push({ to, ok: false, error: e?.message || String(e) });
        console.warn("[onboarding-notify] email failed", to, e?.message || e);
      }
    }
  } else if (emailTargets.length) {
    result.email = {
      skipped: true,
      reason: "Set RESEND_API_KEY (+ optional ONBOARDING_NOTIFY_FROM_EMAIL) to send email",
      wouldSendTo: emailTargets,
    };
  }

  if (!channels.length) {
    result.delivery = "logged_only";
    result.hint =
      "Configure ONBOARDING_NOTIFY_WEBHOOK_URL (Zapier/Make → WhatsApp) and/or RESEND_API_KEY for real delivery";
  }

  return result;
}
