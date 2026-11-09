import { Router } from "express";
import express from "express";
import { prisma } from "../lib/prisma.js";
import { markPaymentComplete, canUpgradePlan } from "../lib/onboarding.js";
import { getStripe } from "../lib/stripe.js";

const router = Router();

/** Stripe webhook — must receive raw body */
router.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const stripe = getStripe();
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!stripe || !secret) {
      return res.status(503).send("Stripe webhook not configured");
    }

    let event;
    try {
      const sig = req.headers["stripe-signature"];
      event = stripe.webhooks.constructEvent(req.body, sig, secret);
    } catch (err) {
      console.error("[stripe/webhook] signature", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
      if (
        event.type === "checkout.session.completed" ||
        event.type === "checkout.session.async_payment_succeeded"
      ) {
        const session = event.data.object;
        const organizationId = session.metadata?.organizationId;
        if (organizationId) {
          const org = await prisma.organization.findUnique({ where: { id: organizationId } });
          const purpose = String(session.metadata?.purpose || "onboarding");
          const needsApply =
            org &&
            (purpose === "upgrade" || !org.paymentDone || canUpgradePlan(org));
          if (needsApply) {
            await markPaymentComplete(org, {
              stripeCustomerId:
                typeof session.customer === "string" ? session.customer : session.customer?.id,
              stripeSubscriptionId:
                typeof session.subscription === "string"
                  ? session.subscription
                  : session.subscription?.id,
              planInterval: session.metadata?.planInterval || org.selectedPlanInterval,
              reference: session.id,
              purpose,
            });
          }
        }
      }
      res.json({ received: true });
    } catch (e) {
      console.error("[stripe/webhook]", e);
      res.status(500).json({ error: "Webhook handler failed" });
    }
  }
);

export default router;
