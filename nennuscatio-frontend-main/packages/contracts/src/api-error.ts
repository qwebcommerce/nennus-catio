import { z } from "zod";
import { bookingQuoteSchema } from "./bookings.js";
import { checkoutQuoteSchema } from "./orders.js";
import { promoCodeStatusSchema } from "./promotions.js";

/**
 * Error envelope the API returns for handled failures. Framework defaults (for example
 * NestJS's 404 body for unknown routes) do not use it; the web client falls back to the
 * HTTP status in that case.
 */
export const apiErrorCodeSchema = z.enum([
  "NOT_FOUND",
  "UNAVAILABLE",
  "FORBIDDEN",
  // Added with authentication (branch #4).
  "VALIDATION_FAILED",
  "UNAUTHENTICATED",
  "INVALID_CREDENTIALS",
  "EMAIL_NOT_VERIFIED",
  "PASSWORD_CHANGE_REQUIRED",
  "TEMPORARY_PASSWORD_EXPIRED",
  "REAUTH_REQUIRED",
  "TOKEN_INVALID",
  "RATE_LIMITED",
  "CONFLICT",
  "CSRF_REJECTED",
  "INTERNAL",
  // Added with checkout (branch 7b).
  "ITEM_UNAVAILABLE",
  "OUT_OF_STOCK",
  "SLOT_UNAVAILABLE",
  "PRICE_CHANGED",
  "HOLD_EXPIRED",
  "NOT_CANCELLABLE",
  // Added with staff order handling (branch 7c).
  "STATUS_CHANGE_NOT_ALLOWED",
  // Added with payments (branch #8, 8a-2).
  "PAYMENTS_UNAVAILABLE",
  "PAYMENT_ATTEMPTS_EXCEEDED",
  "PAYMENT_IN_PROGRESS",
  "PAYMENT_START_FAILED",
  "ORDER_NOT_PAYABLE",
  // Added with refunds (branch #8, 8a-4).
  "REFUND_FAILED",
  // Added with customer accounts (branch #10, 10a): the most saved addresses or pets.
  "LIMIT_REACHED",
  // Added with promotions at checkout (branch #11, 11b): a promo code that gives nothing; the message says why.
  "PROMO_CODE_INVALID",
  // Added with downloads in CSV, Excel and PDF (branch #12, part 2): another download still being made
  // for the same staff member, a PDF over its row limit, and the PDF engine missing or too slow.
  "DOWNLOAD_BUSY",
  "TOO_MANY_ROWS",
  "PDF_UNAVAILABLE",
  "PDF_TIMEOUT",
]);

export const apiErrorSchema = z.object({
  code: apiErrorCodeSchema,
  message: z.string(),
  /** Field-level problems for VALIDATION_FAILED; paths are dot-joined (for example "password"). */
  fields: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
  /** For RATE_LIMITED: how long to wait. */
  retryAfterSeconds: z.number().int().nonnegative().optional(),
  /**
   * For PRICE_CHANGED from checkout (#11 review, D207): the server's price for this checkout now, worked
   * out with the customer's email. Show it, and send its total again as `expectedTotal` to confirm.
   */
  quote: checkoutQuoteSchema.optional(),
  /** For PRICE_CHANGED from a booking (11c): the same, the server's price for this booking now. */
  bookingQuote: bookingQuoteSchema.optional(),
  /** For PROMO_CODE_INVALID (#11, D207): why the code gives nothing, for the website to word in each language. */
  codeStatus: promoCodeStatusSchema.optional(),
});

export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;
export type ApiErrorBody = z.infer<typeof apiErrorSchema>;
