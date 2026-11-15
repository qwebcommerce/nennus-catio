import { describe, expect, it } from "vitest";
import {
  createDispatchRepository,
  dispatchJobs,
  dispatchMetrics,
  mockDispatchRepository,
} from "@/mocks/adapters/dispatch-repository";
import { mockBusinessRepository } from "@/mocks/adapters/business-repository";
import { seedDemo } from "@/mocks/data/business";

describe("Dispatch mock workflow", () => {
  it("only queues paid deliveries and paid Home Grooming; source edits remain visible", () => {
    const d = seedDemo();
    let jobs = dispatchJobs(d);
    expect(jobs).toHaveLength(7);
    expect(jobs.some((j) => j.sourceId === "FO-1011")).toBe(false);
    expect(jobs.some((j) => j.sourceId === "GB-2007")).toBe(false);
    expect(jobs.filter((j) => j.kind === "house")).toHaveLength(0);
    d.orders.find((o) => o.id === "FO-1011")!.payment = "paid";
    expect(dispatchJobs(d).some((j) => j.sourceId === "FO-1011")).toBe(true);
    d.orders.find((o) => o.id === "FO-1009")!.status = "cancelled";
    jobs = dispatchJobs(d);
    expect(jobs.some((j) => j.sourceId === "FO-1009")).toBe(false);
    const house = d.products.find((p) => p.house)!;
    d.orders[0].items[0].productId = house.id;
    expect(
      dispatchJobs(d).find((j) => j.sourceId === d.orders[0].id)?.kind,
    ).toBe("house");
  });
  it("checks compatible teams/slots and assigns a selected set atomically without duplicate activity", () => {
    const d = seedDemo(),
      r = createDispatchRepository();
    const delivery = dispatchJobs(d).find(
      (j) => j.status === "awaiting" && j.kind === "product",
    )!;
    const grooming = dispatchJobs(d).find((j) => j.kind === "grooming")!;
    expect(r.assign(d, [delivery.id, grooming.id], "driver-01", "")).toBe(
      "assignment",
    );
    expect(r.getSnapshot()).toEqual({});
    expect(
      r.assign(d, [delivery.id, delivery.id], "driver-01", "Handle carefully"),
    ).toBeNull();
    expect(
      r.assign(d, [delivery.id], "driver-01", "Handle carefully"),
    ).toBeNull();
    expect(r.getSnapshot()[delivery.id].events).toHaveLength(1);
    d.orders.find((o) => o.id === delivery.sourceId)!.slotId = "missing";
    expect(r.assign(d, [delivery.id], "driver-02", "")).toBe("assignment");
  });
  it("requires assignment and sequential progress; source payment/status is not changed", () => {
    const d = seedDemo(),
      before = structuredClone(d),
      r = createDispatchRepository();
    const job = dispatchJobs(d).find((j) => j.status === "awaiting")!;
    const member = job.kind === "grooming" ? "groomer-01" : "driver-01";
    expect(r.advance(d, job.id, "en-route")).toBe("transition");
    r.assign(d, [job.id], member, "");
    expect(r.advance(d, job.id, "completed")).toBe("transition");
    expect(r.advance(d, job.id, "en-route")).toBeNull();
    expect(r.advance(d, job.id, "en-route")).toBe("transition");
    expect(r.advance(d, job.id, "completed")).toBeNull();
    expect(r.assign(d, [job.id], member, "")).toBe("assignment");
    expect(d).toEqual(before);
    expect(
      dispatchMetrics(dispatchJobs(d, r.getSnapshot()), job.date).completed,
    ).toBeGreaterThan(0);
    expect(dispatchMetrics(dispatchJobs(d), "2000-01-01").today).toBe(0);
  });
  it("uses the shared Reset demo action to clear assignment metadata", () => {
    mockBusinessRepository.reset();
    const d = mockBusinessRepository.getSnapshot(),
      job = dispatchJobs(d).find((j) => j.status === "awaiting")!;
    mockDispatchRepository.assign(
      d,
      [job.id],
      job.kind === "grooming" ? "groomer-01" : "driver-01",
      "",
    );
    expect(Object.keys(mockDispatchRepository.getSnapshot())).toHaveLength(1);
    mockBusinessRepository.reset();
    expect(mockDispatchRepository.getSnapshot()).toEqual({});
  });
});
