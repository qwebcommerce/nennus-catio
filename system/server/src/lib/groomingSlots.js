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
