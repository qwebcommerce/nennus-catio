const BLOCKING = ["BOOKED", "CONFIRMED", "CHECKED_IN", "IN_PROGRESS"];

export function weekdayOf(isoDate) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoDate || ""));
  if (!match) return null;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))).getUTCDay();
}

export function qatarDateTime(isoDate, minutes) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoDate || ""));
  if (!match) return null;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), hours - 3, mins, 0));
}

export function qatarParts(date) {
  const shifted = new Date(date.getTime() + 3 * 60 * 60 * 1000);
  return {
    weekday: shifted.getUTCDay(),
    minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
  };
}

export function minutesOf(hhmm) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || ""));
  if (!match) return null;
  const hours = Number(match[1]);
  const mins = Number(match[2]);
  if (hours > 23 || mins > 59) return null;
  return hours * 60 + mins;
}

export function blockingWhere(organizationId, start, end, excludeId) {
  return {
    organizationId,
    ...(excludeId ? { NOT: { id: excludeId } } : {}),
    startAt: { lt: end },
    endAt: { gt: start },
    OR: [
      { status: { in: BLOCKING } },
      { status: "PENDING_PAYMENT", holdExpiresAt: { gt: new Date() } },
    ],
  };
}

export async function slotTaken(db, organizationId, start, end, excludeId) {
  return db.appointment.count({ where: blockingWhere(organizationId, start, end, excludeId) });
}

/** Today's civil date in Qatar (UTC+3, no DST), as YYYY-MM-DD. */
export function qatarToday(now = new Date()) {
  return new Date(now.getTime() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** Minutes since midnight, Qatar time. */
export function qatarNowMinutes(now = new Date()) {
  return qatarParts(now).minutes;
}

/** UTC instants that bound one Qatar calendar day (NFR-04). */
export function qatarDayBounds(isoDate) {
  const from = qatarDateTime(isoDate, 0);
  if (!from) return null;
  return { from, to: new Date(from.getTime() + 24 * 60 * 60 * 1000 - 1) };
}

function slotError(message, status, errorAr) {
  const err = new Error(message);
  err.status = status;
  err.errorEn = message;
  if (errorAr) err.errorAr = errorAr;
  return err;
}

/**
 * Validates a booking time against the grooming hours and claims capacity atomically
 * (FR-48, FR-50, NFR-06). Must run inside a transaction: the schedule rows for that
 * weekday are locked FOR UPDATE, so two bookings for the same day are checked one after
 * the other and the second sees the first's hold.
 *
 * grid: the package duration in minutes when the start must sit on the offered slot grid
 * (customer bookings); null lets staff place a booking anywhere inside the hours.
 */
export async function claimSlot(tx, { organizationId, startAt, endAt, excludeId, grid }) {
  const local = qatarParts(startAt);
  const schedules = await tx.$queryRaw`
    SELECT id, "startTime", "endTime", capacity FROM "GroomingSchedule"
    WHERE "organizationId" = ${organizationId} AND weekday = ${local.weekday} AND "isActive" = true
    ORDER BY id FOR UPDATE`;
  const startMin = local.minutes;
  const endMin = startMin + Math.round((endAt.getTime() - startAt.getTime()) / 60000);
  const schedule = schedules.find((row) => {
    const open = minutesOf(row.startTime);
    const close = minutesOf(row.endTime);
    if (open == null || close == null) return false;
    if (startMin < open || endMin > close) return false;
    return !grid || (startMin - open) % grid === 0;
  });
  if (!schedule) {
    throw slotError(
      grid ? "Choose one of the offered times" : "That time is outside grooming hours",
      400,
      grid ? "اختر أحد الأوقات المتاحة" : "هذا الوقت خارج ساعات التجميل",
    );
  }
  const taken = await slotTaken(tx, organizationId, startAt, endAt, excludeId);
  if (taken >= Number(schedule.capacity)) {
    throw slotError("That time is no longer free", 409, "هذا الوقت لم يعد متاحاً");
  }
  return schedule;
}
