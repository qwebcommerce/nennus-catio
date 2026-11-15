import type { LocalisedText } from "@nennus-catio/contracts";
import type { DemoState } from "../data/business";
import {
  dispatchTeam,
  type DispatchChanges,
  type DispatchKind,
  type DispatchStatus,
} from "../data/dispatch";

export interface DispatchJob {
  id: string;
  sourceId: string;
  source: "order" | "booking";
  kind: DispatchKind;
  customerId: string;
  customerName: string;
  email: string;
  phone: string;
  petName: string;
  image: string;
  address: string;
  date: string;
  time: string;
  duration: number;
  status: DispatchStatus;
  assignedTo: string;
  note: string;
  events: DispatchChanges[string]["events"];
  sourceCompleted: boolean;
  items: {
    id: string;
    name: LocalisedText;
    sku: string;
    quantity: number;
    image: string;
  }[];
}
/** One job per source record. Never duplicate customers, order lines or house orders. */
export function dispatchJobs(
  d: DemoState,
  changes: DispatchChanges = {},
): DispatchJob[] {
  const jobs: DispatchJob[] = [];
  const customer = (id: string) => {
    const g = d.guests.find((g) => g.id === id);
    return {
      customerId: id,
      customerName: g?.name ?? "",
      email: g?.email ?? "",
      phone: g?.phone ?? "",
    };
  };
  for (const o of d.orders) {
    if (
      o.fulfilment !== "delivery" ||
      o.payment !== "paid" ||
      o.status === "cancelled"
    )
      continue;
    const slot = d.slots.find(
      (s) => s.id === o.slotId && s.kind === "delivery",
    );
    const items = o.items.map((line, index) => ({
      id: `${line.variantId}-${index}`,
      name: line.name,
      sku: line.sku,
      quantity: line.quantity,
      image: d.products.find((p) => p.id === line.productId)?.image ?? "",
    }));
    jobs.push({
      id: `DSP-${o.id}`,
      sourceId: o.id,
      source: "order",
      kind: o.items.some(
        (l) => d.products.find((p) => p.id === l.productId)?.house,
      )
        ? "house"
        : "product",
      ...customer(o.customerId),
      petName: "",
      image: items[0]?.image ?? "",
      address: o.address,
      date: slot?.date ?? "",
      time: slot?.time ?? "",
      duration: 0,
      items,
      ...metadata(`DSP-${o.id}`, o.status === "completed", changes),
    });
  }
  for (const b of d.bookings) {
    if (
      b.location !== "home" ||
      b.payment !== "paid" ||
      b.status === "cancelled"
    )
      continue;
    const slot = d.slots.find(
      (s) => s.id === b.slotId && s.kind === "grooming",
    );
    const image = d.packages.find((p) => p.id === b.packageId)?.image ?? "";
    jobs.push({
      id: `DSP-${b.id}`,
      sourceId: b.id,
      source: "booking",
      kind: "grooming",
      ...customer(b.customerId),
      petName: b.petName,
      image,
      address: b.address,
      date: slot?.date ?? "",
      time: slot?.time ?? "",
      duration: b.duration,
      items: [
        { id: b.packageId, name: b.packageName, sku: "", quantity: 1, image },
      ],
      ...metadata(`DSP-${b.id}`, b.status === "completed", changes),
    });
  }
  return jobs.sort(
    (a, b) =>
      `${a.date || "9999"} ${a.time}`.localeCompare(
        `${b.date || "9999"} ${b.time}`,
      ) || a.id.localeCompare(b.id),
  );
}
function metadata(id: string, completed: boolean, changes: DispatchChanges) {
  const change = changes[id];
  return {
    sourceCompleted: completed,
    status: completed
      ? ("completed" as const)
      : (change?.status ?? ("awaiting" as const)),
    assignedTo: change?.assignedTo ?? "",
    note: change?.note ?? "",
    events: change?.events ?? [],
  };
}
export function dispatchMetrics(jobs: DispatchJob[], day: string) {
  const today = jobs.filter((j) => j.date === day);
  return {
    today: today.length,
    awaiting: today.filter((j) => j.status === "awaiting").length,
    enRoute: today.filter((j) => j.status === "en-route").length,
    completed: today.filter((j) => j.status === "completed").length,
  };
}
export function createDispatchRepository() {
  let changes: DispatchChanges = {};
  const initial = changes;
  const listeners = new Set<() => void>();
  const publish = (next: DispatchChanges) => {
    changes = next;
    for (const listener of listeners) listener();
  };
  return {
    getSnapshot: () => changes,
    getServerSnapshot: () => initial,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    reset: () => publish({}),
    assign(d: DemoState, ids: string[], memberId: string, note: string) {
      const jobs = dispatchJobs(d, changes),
        uniqueIds = [...new Set(ids)];
      const member = dispatchTeam.find((m) => m.id === memberId);
      if (!member || !uniqueIds.length || note.length > 500)
        return "invalid" as const;
      const selected = uniqueIds.map((id) => jobs.find((j) => j.id === id));
      if (
        selected.some(
          (j) =>
            !j ||
            j.status === "completed" ||
            !j.date ||
            !j.time ||
            (j.kind === "grooming"
              ? member.role !== "groomer"
              : member.role !== "driver"),
        )
      )
        return "assignment" as const;
      const next = { ...changes },
        at = new Date().toISOString();
      for (const job of selected) {
        if (!job) continue;
        if (job.assignedTo === memberId && job.note === note.trim()) continue;
        const status = job.status === "en-route" ? "en-route" : "assigned";
        next[job.id] = {
          assignedTo: memberId,
          status,
          note: note.trim(),
          events: [
            ...job.events,
            {
              id: crypto.randomUUID(),
              at,
              status,
              assignedTo: memberId,
              note: note.trim(),
            },
          ],
        };
      }
      publish(next);
      return null;
    },
    advance(d: DemoState, id: string, status: DispatchStatus) {
      const job = dispatchJobs(d, changes).find((j) => j.id === id);
      if (
        !job?.assignedTo ||
        !(
          (job.status === "assigned" && status === "en-route") ||
          (job.status === "en-route" && status === "completed")
        )
      )
        return "transition" as const;
      const at = new Date().toISOString();
      publish({
        ...changes,
        [id]: {
          assignedTo: job.assignedTo,
          status,
          note: job.note,
          events: [
            ...job.events,
            {
              id: crypto.randomUUID(),
              at,
              status,
              assignedTo: job.assignedTo,
              note: "",
            },
          ],
        },
      });
      return null;
    },
  };
}
export const mockDispatchRepository = createDispatchRepository();
