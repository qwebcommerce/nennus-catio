#!/usr/bin/env node
/**
 * Demo data for a live database: a Qatar pet shop with 30 days of activity, removable with one switch.
 *
 *   node scripts/demo-data.mjs load     loads the demo (does nothing if it is already loaded)
 *   node scripts/demo-data.mjs remove   deletes every demo row, and nothing else
 *   node scripts/demo-data.mjs status   prints what is loaded
 *
 * On Vercel it runs from scripts/migrate-on-deploy.mjs when DEMO_DATA=load or DEMO_DATA=remove
 * (see docs/testing/README.md, "Demo data").
 *
 * How it works (load):
 *  - The real Express app (src/app.js) is started inside this process on a localhost port, and the
 *    demo is created through its HTTP API as the organisation owner (and demo staff), so stock
 *    movements, unit costs, cost of goods, bills, payments, promotions, audit rows, references and
 *    versions are exactly what the application writes. No e-mail is sent (RESEND_API_KEY is removed
 *    for this process and queued demo mail is marked never-to-send), the card gateway is an
 *    in-process mock (SkipCash is never called), FleetWiz and Supabase Storage are switched off.
 *  - Every row the application creates is recorded in "DemoRecord": rows created directly are
 *    caught by a Prisma query extension; rows created inside them (sale lines, stock rows, …) are
 *    found by following foreign keys from those rows.
 *  - Each action runs at its planned day and time in the last 30 days (Qatar business hours): its
 *    requests carry that time and, inside the app, the clock and the Prisma timestamps follow it
 *    (see "demo clock" below), so every row is dated when it would have happened and every rule
 *    that depends on the time (hold expiry, booking hours, promotion dates) applies as on that day.
 *    Independent parts (stock, shop till, vans, website) run in parallel lanes to keep the load
 *    short when the database is far away; no lane runs ahead of the stock lane.
 * remove: deletes the recorded rows (plus anything later created on top of demo rows, such as a
 * test sale of a demo product) in one transaction, children first, and puts the website selling
 * location back.
 */
import crypto from "crypto";
import { AsyncLocalStorage } from "async_hooks";
import { performance } from "perf_hooks";
import "../src/loadEnv.js";
import { DemoRecords, countByTable } from "./demo/records.mjs";
import * as C from "./demo/content.mjs";
import { demoPdf, planSalesOrdersDemo } from "./demo/salesOrders.mjs";
import { planB2bDemo } from "./demo/b2b.mjs";
import { planDispatchDemo } from "./demo/dispatch.mjs";

const command = String(process.argv[2] || "").toLowerCase();
const START = Date.now();
const log = (...a) => console.log("[demo]", ...a);
const secs = (ms) => `${(ms / 1000).toFixed(1)} s`;

const DAY_MS = 86400000;
const QA_OFFSET = 3 * 3600000;

// ------------------------------------------------------------------ helpers

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(20261119);
const pick = (list) => list[Math.floor(rand() * list.length)];
const between = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));

/** "YYYY-MM-DD" of the Qatar day `offset` days from today. */
function qDay(offset, now = new Date()) {
  return new Date(now.getTime() + QA_OFFSET + offset * DAY_MS).toISOString().slice(0, 10);
}
/** Instant of a Qatar wall-clock time on the Qatar day `offset` days from today. */
function qAt(offset, hhmm, now = new Date()) {
  const [h, m] = String(hhmm).split(":").map(Number);
  const [y, mo, d] = qDay(offset, now).split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, d, h, m) - QA_OFFSET);
}
/** 0 = Sunday … 6 = Saturday, of a Qatar day. */
const weekdayOf = (offset) => new Date(`${qDay(offset)}T12:00:00Z`).getUTCDay();
const hhmm = (minutes) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
const riyals = (dirhams) => `${Math.floor(dirhams / 100)}.${String(dirhams % 100).padStart(2, "0")}`;
const dirhams = (r) => Math.round(Number(r) * 100);

function pickOrg(orgs) {
  const envId = process.env.SHOP_ORGANIZATION_ID?.trim();
  if (envId) return orgs.find((o) => o.id === envId) || null;
  const sorted = [...orgs].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  return sorted.find((o) => o.websiteBranchId) || sorted[0] || null;
}

// ------------------------------------------------------------------ demo clock
/**
 * Each demo action runs at its planned time in the last 30 days. The loader's requests carry that
 * time (X-Demo-Clock); inside the app's handling of such a request `new Date()` / `Date.now()` give
 * the planned time (advancing in real time from there), and the Prisma extension below writes the
 * same clock into createdAt / updatedAt / other now()-default columns. Everything else (stock,
 * money, hold expiry, booking rules) then works exactly as on that day. Outside a demo request the
 * clock is the real one. This only exists inside the loader process.
 */
const serverClock = new AsyncLocalStorage();
const clientClock = new AsyncLocalStorage();
const RealDate = Date;
function demoNow() {
  const s = serverClock.getStore();
  return s ? Math.floor(s.base + (performance.now() - s.p0)) : RealDate.now();
}
function installDemoClock() {
  if (globalThis.Date !== RealDate) return;
  class DemoDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) super(demoNow());
      else super(...args);
    }
    static now() {
      return demoNow();
    }
  }
  globalThis.Date = DemoDate;
}
/** Runs fn with the server-side clock at `ms` (used for the loader's own reads of app logic). */
const atClock = (ms, fn) => serverClock.run({ base: ms, p0: performance.now() }, fn);

// ------------------------------------------------------------------ database client

async function makeClients({ track = false, poolLimit = 1 } = {}) {
  const { PrismaClient } = await import("@prisma/client");
  const { withPrismaPoolLimit } = await import("../src/lib/dbUrl.js");
  const base = new PrismaClient({
    omit: {
      user: { passwordHash: true, resetTokenHash: true },
      customer: { passwordHash: true, verifyTokenHash: true, resetTokenHash: true },
    },
    transactionOptions: { maxWait: 10000, timeout: 30000 },
    log: process.env.DEMO_DEBUG ? [{ emit: "event", level: "query" }, "error"] : ["error"],
    datasources: { db: { url: withPrismaPoolLimit(process.env.DATABASE_URL, poolLimit) } },
  });
  if (process.env.DEMO_DEBUG) {
    globalThis.__demoQueries = new Map();
    base.$on("query", () => {
      const key = serverClock.getStore()?.path || "(loader)";
      globalThis.__demoQueries.set(key, (globalThis.__demoQueries.get(key) || 0) + 1);
    });
  }
  if (!track) return { base, app: base, created: null };
  const created = [];
  // now()-default and @updatedAt columns per model, and relation fields, for the demo clock.
  const { Prisma } = await import("@prisma/client");
  const meta = new Map();
  for (const m of Prisma.dmmf.datamodel.models) {
    meta.set(m.name, {
      onCreate: m.fields.filter((f) => f.default?.name === "now" || f.isUpdatedAt).map((f) => f.name),
      onUpdate: m.fields.filter((f) => f.isUpdatedAt).map((f) => f.name),
      rel: new Map(m.fields.filter((f) => f.kind === "object").map((f) => [f.name, f.type])),
    });
  }
  const stampCreate = (model, data) => {
    if (!data || typeof data !== "object" || !serverClock.getStore()) return data;
    if (Array.isArray(data)) return data.map((d) => stampCreate(model, d));
    const m = meta.get(model);
    if (!m) return data;
    const out = { ...data };
    for (const f of m.onCreate) if (out[f] === undefined) out[f] = new Date();
    return stampNested(m, out);
  };
  const stampUpdate = (model, data) => {
    if (!data || typeof data !== "object" || !serverClock.getStore()) return data;
    const m = meta.get(model);
    if (!m) return data;
    const out = { ...data };
    for (const f of m.onUpdate) if (out[f] === undefined) out[f] = new Date();
    return stampNested(m, out);
  };
  const stampNested = (m, out) => {
    for (const [field, type] of m.rel) {
      const v = out[field];
      if (!v || typeof v !== "object") continue;
      const n = { ...v };
      if (n.create) n.create = stampCreate(type, n.create);
      if (n.createMany?.data) n.createMany = { ...n.createMany, data: stampCreate(type, n.createMany.data) };
      if (n.connectOrCreate) {
        const list = Array.isArray(n.connectOrCreate) ? n.connectOrCreate : [n.connectOrCreate];
        const mapped = list.map((x) => ({ ...x, create: stampCreate(type, x.create) }));
        n.connectOrCreate = Array.isArray(n.connectOrCreate) ? mapped : mapped[0];
      }
      out[field] = n;
    }
    return out;
  };
  const app = base.$extends({
    query: {
      $allModels: {
        async update({ model, args, query }) {
          return query({ ...args, data: stampUpdate(model, args.data) });
        },
        async updateMany({ model, args, query }) {
          return query({ ...args, data: stampUpdate(model, args.data) });
        },
        async upsert({ model, args, query }) {
          return query({ ...args, create: stampCreate(model, args.create), update: stampUpdate(model, args.update) });
        },
        async createMany({ model, args, query }) {
          return query({ ...args, data: stampCreate(model, args.data) });
        },
        async create({ model, args, query }) {
          const a0 = { ...args, data: stampCreate(model, args.data) };
          // Demo mail is written as never-to-send, so no mail sender (here or on a live instance) picks it up.
          if (model === "EmailOutbox") a0.data = { ...a0.data, status: "FAILED", lastError: "Demo data: never sent" };
          const a = a0.select && !a0.select.id ? { ...a0, select: { ...a0.select, id: true } } : a0;
          const row = await query(a);
          if (row && row.id != null) created.push([model, String(row.id)]);
          return row;
        },
        async createManyAndReturn({ model, args, query }) {
          const rows = await query({ ...args, data: stampCreate(model, args.data) });
          for (const row of rows || []) if (row?.id != null) created.push([model, String(row.id)]);
          return rows;
        },
      },
    },
  });
  return { base, app, created };
}

// ------------------------------------------------------------------ status

async function status() {
  const { base } = await makeClients();
  try {
    const rec = new DemoRecords(base, log);
    await rec.ensureTable();
    const state = await rec.loadState();
    const counts = await base.$queryRawUnsafe(
      `SELECT "entityType" AS t, count(*)::int AS n FROM "DemoRecord" WHERE "entityType" <> '_load' GROUP BY 1 ORDER BY 1`,
    );
    const total = counts.reduce((s, r) => s + r.n, 0);
    if (!state && !total) {
      log("status: no demo data loaded.");
      return { loaded: false };
    }
    log(`status: ${state?.status || "unknown"}${state?.organizationId ? ` (organization ${state.organizationId})` : ""}`);
    if (state?.finishedAt) log(`loaded at ${state.finishedAt} in ${state.seconds} s; activity ${state.from} … ${state.to}`);
    if (state?.error) log(`last error: ${state.error}`);
    log(`${total} demo rows:`);
    for (const r of counts) console.log(`  ${r.t.padEnd(22)} ${String(r.n).padStart(6)}`);
    return { loaded: state?.status === "loaded", state, counts };
  } finally {
    await base.$disconnect();
  }
}

// ------------------------------------------------------------------ remove

async function removeDemo({ base, reason = "remove" } = {}) {
  const own = !base;
  if (own) ({ base } = await makeClients());
  const t = Date.now();
  try {
    const rec = new DemoRecords(base, log);
    await rec.ensureTable();
    const state = await rec.loadState();
    const seed = await rec.recorded();
    if (!state && !seed.size) {
      log("remove: no demo data to remove.");
      return { removed: 0 };
    }
    const set = await rec.closure(seed);
    const demoBranches = set.get("Branch") || new Set();
    const counts = await rec.deleteAll(set, {
      // Put the website selling location back before the demo locations go.
      beforeDelete: async (tx) => {
        const site = state?.website;
        if (!site?.organizationId) return;
        const rows = await tx.$queryRawUnsafe(
          `SELECT "websiteBranchId" AS w, "version" AS v FROM "Organization" WHERE id = $1`,
          site.organizationId,
        );
        const org = rows[0];
        if (!org || !org.w || !demoBranches.has(org.w)) return;
        const prevOk = site.before
          ? (await tx.$queryRawUnsafe(`SELECT 1 FROM "Branch" WHERE id = $1`, site.before)).length > 0
          : true;
        const prev = prevOk ? site.before : null;
        if (org.v === site.versionAfter) {
          // Nothing else changed the settings since: restore them exactly (value, version, updatedAt).
          await tx.$executeRawUnsafe(
            `UPDATE "Organization" SET "websiteBranchId" = $2, "version" = $3, "updatedAt" = $4::timestamp(3) WHERE id = $1`,
            site.organizationId, prev, site.versionBefore, site.updatedAtBefore,
          );
        } else {
          await tx.$executeRawUnsafe(`UPDATE "Organization" SET "websiteBranchId" = $2 WHERE id = $1`, site.organizationId, prev);
        }
      },
    });
    const total = Object.values(counts).reduce((s, n) => s + n, 0);
    log(`${reason}: deleted ${total} rows in ${secs(Date.now() - t)}`);
    for (const [k, n] of Object.entries(counts).sort()) console.log(`  ${k.padEnd(22)} ${String(n).padStart(6)}`);
    return { removed: total, counts };
  } finally {
    if (own) await base.$disconnect();
  }
}

// ------------------------------------------------------------------ load

async function load() {
  // 1. This process only: no real e-mail, gateway, delivery partner or file storage.
  for (const k of ["RESEND_API_KEY", "FLEETWIZ_API_URL", "FLEETWIZ_API_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) delete process.env[k];
  process.env.NC_DEMO_LOADER = "1";
  process.env.SKIPCASH_KEY_ID = "demo-key-id";
  process.env.SKIPCASH_SECRET = crypto.randomBytes(24).toString("hex");
  process.env.SKIPCASH_WEBHOOK_KEY = crypto.randomBytes(24).toString("hex");
  if (!process.env.JWT_SECRET) {
    log("JWT_SECRET is not set; skipping.");
    return { skipped: true };
  }
  installDemoClock();
  const { startMockGateway } = await import("./demo/mockGateway.mjs");
  const gateway = await startMockGateway({ secret: process.env.SKIPCASH_SECRET, keyId: process.env.SKIPCASH_KEY_ID });
  process.env.SKIPCASH_API_URL = gateway.url;

  const { base, app: tracked, created } = await makeClients({ track: true, poolLimit: 10 });
  const rec = new DemoRecords(base, log);
  let server;
  try {
    await rec.ensureTable();
    const prior = await rec.loadState();
    if (prior?.status === "loaded") {
      log(`demo data is already loaded (since ${prior.finishedAt}); nothing to do.`);
      return { skipped: true };
    }
    if (prior?.status === "running" && Date.now() - new Date(prior.startedAt).getTime() < 30 * 60000) {
      log(`another demo load started at ${prior.startedAt} and may still be running; nothing to do.`);
      return { skipped: true };
    }
    if (prior || (await rec.recorded()).size) {
      log("an earlier demo load did not finish; removing what it left first.");
      await removeDemo({ base, reason: "cleanup" });
    }

    const orgs = await base.organization.findMany({ select: { id: true, name: true, websiteBranchId: true, createdAt: true, version: true, updatedAt: true } });
    const org = pickOrg(orgs);
    if (!org) {
      log("no organization in the database; nothing to load.");
      return { skipped: true };
    }
    const owner = await base.user.findFirst({
      where: { organizationId: org.id, role: "ADMIN" },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, sessionVersion: true, active: true },
    });
    if (!owner?.active) {
      log("the organization owner account is missing or deactivated; nothing to load.");
      return { skipped: true };
    }
    const state = { status: "running", startedAt: new Date().toISOString(), organizationId: org.id };
    if (!(await rec.claimLoad(state))) {
      log("another demo load holds the lock; nothing to do.");
      return { skipped: true };
    }

    // 2. The application, in this process, on a private port.
    globalThis.prisma = tracked;
    const { default: app } = await import("../src/app.js");
    const { signToken } = await import("../src/middleware/auth.js");
    const { default: express } = await import("express");
    // The body is read before the clock is set (stream events do not keep the async context);
    // the app's own JSON parser then sees it parsed and skips.
    const outer = express();
    outer.use(express.json({ limit: "8mb" }));
    outer.use((req, _res, next) => {
      const at = Number(req.headers["x-demo-clock"]);
      if (!Number.isFinite(at) || at <= 0) return next();
      serverClock.run({ base: at, p0: performance.now(), path: `${req.method} ${req.path.replace(/[a-z0-9]{20,}/g, ":id")}` }, next);
    });
    outer.use(app);
    server = await new Promise((resolve) => {
      const s = outer.listen(0, "127.0.0.1", () => resolve(s));
    });
    const api = makeApi(`http://127.0.0.1:${server.address().port}`);

    const ctx = {
      org, owner, api, gateway, base, rec, created, state, signToken,
      actions: 0,
      flushAt: 0,
      tokens: { owner: signToken({ sub: owner.id, typ: "staff", organizationId: org.id, sv: owner.sessionVersion }) },
    };
    const t1 = Date.now();
    // Stopped from outside (build timeout): record what exists so the next run removes it at once.
    const onStop = async () => {
      try {
        await flush(ctx, true);
        await rec.saveState({ ...state, status: "failed", error: "stopped before it finished" });
        log("stopped before it finished; the next load (or remove) takes the partial demo data out.");
      } finally {
        process.exit(1);
      }
    };
    process.once("SIGTERM", onStop);
    process.once("SIGINT", onStop);
    try {
      await runPlan(ctx);
    } catch (e) {
      log(`LOAD FAILED: ${e?.stack || e}`);
      // Record what was created, then take it all out again so the database is as before.
      try {
        await flush(ctx, true);
        const set = await rec.closure(await rec.recorded());
        await rec.record([...set].flatMap(([t, keys]) => [...keys].map((k) => [t, k])));
        state.status = "failed";
        state.error = String(e?.message || e).slice(0, 500);
        await rec.saveState(state);
        await removeDemo({ base, reason: "rollback" });
      } catch (e2) {
        log(`rollback failed (${e2?.message || e2}); run "remove" (DEMO_DATA=remove) to clean up.`);
      }
      throw e;
    }
    const tPlan = Date.now() - t1;

    // 3. Find every row that belongs to the demo, record it, move it into the past.
    const t2 = Date.now();
    await flush(ctx, true);
    const set = await rec.closure(await rec.recorded());
    await rec.record([...set].flatMap(([t, keys]) => [...keys].map((k) => [t, k])));
    // Queued demo e-mail is never sent (to demo customers or to the shop's own alert address).
    const outbox = [...(set.get("EmailOutbox") || [])];
    if (outbox.length) {
      await base.$executeRawUnsafe(
        `UPDATE "EmailOutbox" SET "status" = 'FAILED', "lastError" = 'Demo data: never sent', "lockedUntil" = NULL WHERE id = ANY($1::text[])`,
        outbox,
      );
    }
    const counts = countByTable(set);
    const total = Object.values(counts).reduce((s, n) => s + n, 0);
    Object.assign(state, {
      status: "loaded",
      finishedAt: new Date().toISOString(),
      seconds: Math.round((Date.now() - START) / 1000),
      from: qDay(-30),
      to: qDay(0),
      rows: total,
      actions: ctx.actions,
    });
    await rec.saveState(state);
    if (globalThis.__demoQueries) {
      const calls = globalThis.__demoCalls || new Map();
      for (const [k, n] of [...globalThis.__demoQueries].sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(`  q ${String(n).padStart(6)} ${k} (${calls.get(k) || 0} calls)`);
    }
    log(`loaded ${total} demo rows (${ctx.actions} actions in ${secs(tPlan)}, recorded in ${secs(Date.now() - t2)}); total ${secs(Date.now() - START)}`);
    for (const [k, n] of Object.entries(counts)) console.log(`  ${k.padEnd(22)} ${String(n).padStart(6)}`);
    return { loaded: true, counts };
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    await gateway.close();
    await base.$disconnect();
  }
}

/** Writes rows created so far into DemoRecord (every few actions, so a crash leaves them findable). */
async function flush(ctx, force = false) {
  if (!force && ctx.created.length - ctx.flushAt < 40) return;
  const part = ctx.created.slice(ctx.flushAt);
  ctx.flushAt = ctx.created.length;
  if (part.length) await ctx.rec.record(part);
}

function makeApi(baseUrl) {
  let n = 0;
  async function call(method, path, body, token, { ok = [200, 201], raw = false, headers: extra = {} } = {}) {
    n += 1;
    // Each request gets its own private address so the app's per-address rate limit never trips.
    const ip = `10.${(n >> 16) & 255}.${(n >> 8) & 255}.${n & 255}`;
    const headers = { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest", "X-Forwarded-For": ip };
    if (token) headers.Authorization = `Bearer ${token}`;
    const clock = clientClock.getStore();
    if (clock) headers["X-Demo-Clock"] = String(Math.floor(clock.at + (performance.now() - clock.t0)));
    Object.assign(headers, extra);
    if (process.env.DEMO_DEBUG) {
      const k = `${method} ${path.split("?")[0].replace(/[a-z0-9]{20,}/g, ":id")}`;
      globalThis.__demoCalls = globalThis.__demoCalls || new Map();
      globalThis.__demoCalls.set(k, (globalThis.__demoCalls.get(k) || 0) + 1);
    }
    let res;
    let text;
    for (let attempt = 1; ; attempt += 1) {
      res = await fetch(baseUrl + path, { method, headers, body: body == null ? undefined : JSON.stringify(body) });
      text = await res.text();
      // Lanes run in parallel: a database deadlock or busy pool rolls the request back; try again.
      // (The till answers a rolled-back deadlock with 400, the webhook with 500.)
      const transient = (res.status >= 400 && /deadlock detected|40P01|P2034|could not serialize/i.test(text)) || res.status === 503;
      if (!transient || attempt >= 4) break;
      call.retries += 1;
      await new Promise((r) => setTimeout(r, 150 * attempt + Math.floor(Math.random() * 200)));
    }
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = text;
    }
    if (raw) return { status: res.status, json };
    if (!ok.includes(res.status)) {
      const err = new Error(`${method} ${path} -> ${res.status}: ${text.slice(0, 400)}`);
      err.status = res.status;
      throw err;
    }
    return json;
  }
  call.retries = 0;
  /** Multipart file upload (PO attachments, payment proofs), with the same demo clock and address headers. */
  call.upload = async (path, buffer, fileName, mime, token) => {
    n += 1;
    const headers = { "X-Requested-With": "XMLHttpRequest", "X-Forwarded-For": `10.${(n >> 16) & 255}.${(n >> 8) & 255}.${n & 255}` };
    if (token) headers.Authorization = `Bearer ${token}`;
    const clock = clientClock.getStore();
    if (clock) headers["X-Demo-Clock"] = String(Math.floor(clock.at + (performance.now() - clock.t0)));
    const fd = new FormData();
    fd.append("file", new Blob([buffer], { type: mime }), fileName);
    const res = await fetch(baseUrl + path, { method: "POST", headers, body: fd });
    const text = await res.text();
    if (res.status !== 201) throw new Error(`POST ${path} (upload) -> ${res.status}: ${text.slice(0, 300)}`);
    return JSON.parse(text);
  };
  return call;
}

// ------------------------------------------------------------------ the plan

async function runPlan(ctx) {
  const { api } = ctx;
  const now = new Date();
  const S = (ctx.S = {
    cat: {}, pet: {}, loc: {}, staff: {}, supplier: {}, product: {}, items: [], itemByKey: {},
    area: {}, windows: [], pkg: {}, customers: {}, promo: {}, sales: [], stock: new Map(),
  });

  // ---------------------------------------------------------- setup (day -30, early morning)
  await clientClock.run({ at: qAt(-30, "07:30", now).getTime(), t0: performance.now() }, () => setup(ctx, now));
  await flush(ctx, true);
  log(`setup done in ${secs(Date.now() - START)}: ${Object.keys(S.product).length} products, ${S.items.length} sellable items`);

  // ---------------------------------------------------------- the timeline, in parallel lanes
  const plan = buildPlan(ctx, now);
  const cutoff = now.getTime() - 2 * 60000;
  const lanes = new Map();
  for (const step of plan.sort((a, b) => a.at - b.at || a.seq - b.seq)) {
    if (step.at.getTime() > cutoff) continue;
    if (!lanes.has(step.lane)) lanes.set(step.lane, []);
    lanes.get(step.lane).push(step);
  }
  // Stock reaches the shop and the vans through transfers in the "stock" lane: a lane never runs
  // ahead (in demo time) of a transfer into the location it sells from. The website sells from
  // the shop.
  const feeds = { shop: /to shop|restock shop|houses to shop/, web: /to shop|restock shop|houses to shop/, van1: /van 1/, van2: /van 2/ };
  const pending = new Map(Object.entries(feeds).map(([lane, re]) => [lane, (lanes.get("stock") || []).filter((s) => re.test(s.label))]));
  const waitFeeds = async (lane, t) => {
    const list = pending.get(lane) || [];
    while (!failed && list.some((s) => !s.done && s.at.getTime() <= t)) await new Promise((r) => setTimeout(r, 15));
  };
  const tTimeline = Date.now();
  let failed = null;
  const runLane = async (name, steps) => {
    for (const step of steps) {
      if (failed) return;
      await waitFeeds(name, step.at.getTime());
      try {
        await clientClock.run({ at: step.at.getTime(), t0: performance.now() }, step.run);
      } catch (e) {
        if (!step.optional) {
          failed = failed || new Error(`${step.label} (${step.at.toISOString()}): ${e.message}`);
          return;
        }
        log(`skipped ${step.label}: ${String(e.message).slice(0, 200)}`);
      }
      step.done = true;
      ctx.actions += 1;
      await flush(ctx);
      if (ctx.actions % 100 === 0) log(`… ${ctx.actions} actions (${secs(Date.now() - tTimeline)})`);
    }
  };
  await Promise.all([...lanes].map(([name, steps]) =>
    runLane(name, steps).finally(() => {
      if (!failed) log(`lane ${name}: ${steps.length} actions done at ${secs(Date.now() - tTimeline)}`);
    })));
  if (failed) throw failed;
  if (api.retries) log(`${api.retries} request(s) retried after a database deadlock between parallel lanes`);
  log(`${ctx.actions} timeline actions in ${secs(Date.now() - tTimeline)} (lanes: ${[...lanes].map(([k, v]) => `${k} ${v.length}`).join(", ")})`);
}

async function setup(ctx, now) {
  const { api, org, base, S } = ctx;
  const T = ctx.tokens;
  const imageBase =
    (process.env.SUPABASE_PUBLIC_IMAGE_PREFIX?.trim() || process.env.PUBLIC_IMAGE_BASE_URL?.trim()) && process.env.APP_PUBLIC_URL?.trim()
      ? process.env.APP_PUBLIC_URL.trim().replace(/\/$/, "")
      : "";
  const img = (p) => `${imageBase}${p}`;

  // Catalogue groups: reuse an existing category / pet type with the same English name.
  const cats = await api("GET", "/api/catalog/categories", null, T.owner);
  const P6 = (list, fn) => inParallel(list, 6, fn);
  await P6(C.CATEGORIES, async (c) => {
    const found = (Array.isArray(cats) ? cats : cats.categories || []).find(
      (x) => String(x.nameEn || "").trim().toLowerCase() === c.nameEn.toLowerCase() || String(x.name || "").trim() === c.name,
    );
    S.cat[c.key] = found ? found.id : (await api("POST", "/api/catalog/categories", { name: c.name, nameEn: c.nameEn }, T.owner)).id;
  });
  const pets = await api("GET", "/api/pet-types", null, T.owner);
  await P6(C.PET_TYPES, async (p) => {
    const found = (Array.isArray(pets) ? pets : []).find((x) => String(x.nameEn || "").trim().toLowerCase() === p.nameEn.toLowerCase());
    S.pet[p.key] = found ? found.id : (await api("POST", "/api/pet-types", { name: p.name, nameEn: p.nameEn }, T.owner)).id;
  });

  // Locations; the website sells from the demo shop while the demo is loaded.
  // One after the other, so the location list keeps this order.
  for (const [key, l] of Object.entries(C.LOCATIONS)) {
    S.loc[key] = (await api("POST", "/api/branches", { name: l.name, nameEn: l.nameEn, address: l.address, kind: l.kind }, T.owner)).id;
  }
  {
    const before = await base.organization.findUnique({ where: { id: org.id }, select: { websiteBranchId: true, version: true, updatedAt: true } });
    await base.$executeRawUnsafe(`UPDATE "Organization" SET "websiteBranchId" = $2 WHERE id = $1`, org.id, S.loc.shop);
    const after = await base.organization.findUnique({ where: { id: org.id }, select: { version: true } });
    ctx.state.website = {
      organizationId: org.id,
      before: before.websiteBranchId,
      versionBefore: before.version,
      updatedAtBefore: before.updatedAt.toISOString().replace("Z", ""),
      set: S.loc.shop,
      versionAfter: after.version,
    };
    await ctx.rec.saveState(ctx.state);
  }

  // Demo staff: random passwords nobody knows; never printed or stored.
  await P6(C.STAFF, async (s) => {
    const r = await api("POST", "/api/users", {
      email: s.email, password: crypto.randomBytes(24).toString("base64url"), name: s.name, nameEn: s.nameEn, role: s.role, branchId: S.loc[s.location],
    }, T.owner, { raw: true });
    if (r.status === 201) {
      S.staff[s.key] = r.json.id;
      T[s.key] = ctx.signToken({ sub: r.json.id, typ: "staff", organizationId: org.id, sv: 0 });
    } else {
      log(`staff ${s.email} not created (${r.status}: ${JSON.stringify(r.json).slice(0, 160)}); the owner does that work instead.`);
    }
  });
  await P6(C.VEHICLES, async (v) => {
    await api("POST", "/api/vehicles", { name: v.name, plate: v.plate, branchId: S.loc[v.van] }, T.owner);
  });
  await P6(C.SUPPLIERS, async (s) => {
    S.supplier[s.key] = (await api("POST", "/api/suppliers", { name: s.name, phone: s.phone, email: s.email, address: s.address, note: s.note }, T.owner)).id;
  });

  // Products. Opening stock only for goods sold by weight (weighed out of sacks at the shop);
  // everything else arrives through purchase orders.
  const productBody = (p, isHouse) => ({
    name: p.name, nameEn: p.nameEn, description: p.description, descriptionEn: p.descriptionEn,
    price: p.price, cost: p.cost, categoryId: S.cat[isHouse ? "houses" : p.cat],
    petType: p.pets.includes("cats") ? "CAT" : p.pets.includes("dogs") ? "DOG" : "OTHER",
    petTypeIds: p.pets.map((k) => S.pet[k]),
    imageUrl: img(p.image),
    branchId: p.sellBy === "WEIGHT" ? S.loc.shop : S.loc.warehouse,
    // Low-stock level at the warehouse (re-order point); the shop keeps the app's default.
    minStockLevel: 2,
    preferredSupplierId: S.supplier[isHouse ? "woodcraft" : p.supplier],
    ...(p.sellBy === "WEIGHT" ? { sellBy: "WEIGHT", initialStock: p.openingGrams, minStockLevel: 3000 } : {}),
    ...(p.variants ? { variants: p.variants.map((v) => ({ label: v.label, labelEn: v.labelEn, price: v.price, minStockLevel: 2 })) } : {}),
    ...(isHouse
      ? {
          isPetHouse: true, takesStock: p.takesStock, leadTimeDays: p.leadTimeDays ?? 2, houseDeliveryFee: p.houseDeliveryFee,
          heightCm: p.dims[0], widthCm: p.dims[1], depthCm: p.dims[2], minStockLevel: 1,
          featuresEn: "Built in Qatar\nNon-toxic, pet-safe finish\nDelivery and assembly in Doha", features: "صُنع في قطر\nطلاء آمن وغير سام للحيوانات\nتوصيل وتركيب في الدوحة",
        }
      : {}),
  });
  const allProducts = [...C.PRODUCTS.map((p) => [p, false]), ...C.HOUSES.map((p) => [p, true])];
  await inParallel(allProducts, 10, async ([p, isHouse]) => {
    const row = await api("POST", "/api/products", productBody(p, isHouse), T.owner);
    S.product[p.key] = { id: row.id, def: p, isHouse };
  });
  const variants = await base.productVariant.findMany({
    where: { productId: { in: Object.values(S.product).map((x) => x.id) } },
    select: { id: true, productId: true, labelEn: true, price: true },
  });
  for (const [key, prod] of Object.entries(S.product)) {
    const p = prod.def;
    const takes = !prod.isHouse || p.takesStock;
    const add = (variant, v) => {
      const item = {
        key: v ? `${key}:${v.labelEn}` : key, pkey: key, productId: prod.id, variantId: variant?.id || null,
        price: dirhams(v ? v.price : p.price), cost: dirhams(v ? v.cost : p.cost), buy: v ? v.buy : p.buy || 0,
        sellBy: p.sellBy || "PIECE", isHouse: prod.isHouse, takesStock: takes, cat: prod.isHouse ? "houses" : p.cat,
        supplier: prod.isHouse ? "woodcraft" : p.supplier, label: v ? `${p.nameEn} ${v.labelEn}` : p.nameEn,
      };
      S.items.push(item);
      S.itemByKey[item.key] = item;
    };
    if (p.variants) {
      for (const v of p.variants) add(variants.find((x) => x.productId === prod.id && x.labelEn === v.labelEn), v);
    } else add(null, null);
  }
  for (const p of C.PRODUCTS.filter((x) => x.sellBy === "WEIGHT")) addStock(S, S.loc.shop, S.itemByKey[p.key], p.openingGrams);

  // Delivery areas and windows; grooming packages and hours; promotions.
  const areas = await api("GET", "/api/delivery-setup/areas", null, T.owner);
  await P6(C.DELIVERY_AREAS, async (a) => {
    const found = (Array.isArray(areas) ? areas : []).find((x) => x.isActive !== false && String(x.nameEn || x.name || "").toLowerCase() === a.nameEn.toLowerCase());
    S.area[a.nameEn] = found ? found.id : (await api("POST", "/api/delivery-setup/areas", { name: a.name, nameEn: a.nameEn, city: "Doha", zone: a.zone, fee: a.fee }, T.owner)).id;
  });
  for (const w of C.DELIVERY_WINDOWS) {
    S.windows.push((await api("POST", "/api/delivery-setup/windows", { ...w, weekday: null }, T.owner)).id);
  }
  await P6(C.GROOMING, async (g) => {
    S.pkg[g.key] = {
      ...g,
      id: (await api("POST", "/api/appointments/services", {
        name: g.name, nameEn: g.nameEn, durationMin: g.durationMin, price: g.price, included: g.included, includedEn: g.includedEn,
        petTypeIds: g.pets.map((k) => S.pet[k]),
      }, T.owner)).id,
    };
  });
  // Grooming hours: keep the shop's own; add the demo hours only on weekdays that have none.
  const schedule = await api("GET", "/api/appointments/schedule", null, T.owner);
  const activeHours = (Array.isArray(schedule) ? schedule : []).filter((r) => r.isActive !== false);
  S.schedule = [...activeHours];
  await P6(C.GROOMING_SCHEDULE.filter((h) => !activeHours.some((r) => r.weekday === h.weekday)), async (h) => {
    await api("POST", "/api/appointments/schedule", h, T.owner);
    S.schedule.push(h);
  });
  const promoStart = qAt(-30, "08:00", now).toISOString();
  {
    const P = C.PROMOTIONS;
    await Promise.all([
      api("POST", "/api/promotions", { ...P.category, categoryId: S.cat[P.category.category], startsAt: promoStart }, T.owner),
      api("POST", "/api/promotions", { ...P.coupon, startsAt: promoStart }, T.owner),
      api("POST", "/api/promotions", { ...P.bogo, productId: S.product[P.bogo.product].id, startsAt: promoStart }, T.owner),
    ]);
  }
}

// ------------------------------------------------------------------ local stock book (mirrors the app)

function stockKey(item) {
  return `${item.productId}|${item.variantId || ""}`;
}
function addStock(S, branchId, item, qty) {
  if (!S.stock.has(branchId)) S.stock.set(branchId, new Map());
  const m = S.stock.get(branchId);
  m.set(stockKey(item), (m.get(stockKey(item)) || 0) + qty);
}
function onHand(S, branchId, item) {
  return S.stock.get(branchId)?.get(stockKey(item)) || 0;
}

/** Up to `n` different lines that the location has in stock (keeps one unit back). */
function basket(S, branchId, n, { houses = false, weight = true, keep = 1 } = {}) {
  const pool = S.items.filter(
    (it) => it.takesStock && (houses || !it.isHouse) && (weight || it.sellBy !== "WEIGHT") && onHand(S, branchId, it) > (it.sellBy === "WEIGHT" ? 2000 : it.isHouse ? 1 : keep),
  );
  const lines = [];
  while (lines.length < n && pool.length) {
    const i = Math.floor(rand() * pool.length);
    const it = pool.splice(i, 1)[0];
    const have = onHand(S, branchId, it);
    let qty;
    if (it.sellBy === "WEIGHT") qty = Math.min(between(5, 30) * 50, have - 1000);
    else if (it.pkey === "wetPouch" && have > 7 && rand() < 0.5) qty = pick([3, 6]);
    else qty = Math.min(have - (it.isHouse ? 1 : keep), it.price < 2000 ? between(2, 5) : it.price < 10000 ? between(1, 2) : 1);
    if (qty < 1) continue;
    lines.push({ item: it, quantity: qty });
  }
  return lines;
}

// ------------------------------------------------------------------ timeline builder

function buildPlan(ctx, now) {
  const { api, gateway } = ctx;
  const S = ctx.S;
  const T = ctx.tokens;
  const owner = T.owner;
  const plan = [];
  let seq = 0;
  // A few random seconds so times do not all end in :00.
  const laneOf = (label) =>
    /^(PO |receive|pay |transfer|restock|expense|set )/.test(label) ? "stock"
      : /^(open shop|shop sale|close shop|walk-in|till refund)/.test(label) ? "shop"
        : /van1/.test(label) ? "van1" : /van2/.test(label) ? "van2" : "web";
  const at = (day, time, label, run, extra = {}) =>
    plan.push({ at: new Date(qAt(day, time, now).getTime() + between(0, 50) * 1000), label, run, seq: seq++, lane: laneOf(label), ...extra });
  /** Demo time of the step that is running. */
  const stepAt = () => clientClock.getStore()?.at || Date.now();
  const staffCall = async (who, method, path, body) => {
    const r = await api(method, path, body, T[who] || owner, { raw: true });
    if (r.status === 403 && T[who] && who !== "owner") return api(method, path, body, owner);
    if (r.status >= 300) throw new Error(`${method} ${path} -> ${r.status}: ${JSON.stringify(r.json).slice(0, 400)}`);
    return r.json;
  };
  const item = (key) => S.itemByKey[key];
  const L = S.loc;

  // ---- purchase orders (create + send, receive, pay)
  const po = {};
  const orderLines = (filter, scale = 1) =>
    S.items.filter((it) => it.takesStock && it.sellBy !== "WEIGHT" && filter(it) && it.buy > 0).map((it) => ({ item: it, quantity: Math.max(1, Math.round(it.buy * (it.isHouse ? 1 : 1.5) * scale)) }));
  const createPo = (key, supplier, lines, note) => async () => {
    const body = {
      supplierId: S.supplier[supplier], branchId: L.warehouse, note,
      lines: lines.map((l) => ({ productId: l.item.productId, variantId: l.item.variantId, quantity: l.quantity, unitCost: riyals(l.item.cost) })),
    };
    const order = await api("POST", "/api/purchase-orders", body, owner);
    await api("POST", `/api/purchase-orders/${order.id}/send`, { version: order.version }, owner);
    po[key] = { id: order.id, lines: order.lines, plan: lines };
  };
  const receivePo = (key, share = 1) => async () => {
    const o = po[key];
    const lines = o.lines.map((l, i) => ({ id: l.id, quantity: share === 1 ? l.quantity - (l.quantityReceived || 0) : i % 2 === 0 ? Math.ceil(l.quantity * share) : 0 }));
    const r = await api("POST", `/api/purchase-orders/${o.id}/receive`, { lines }, owner);
    o.bill = r.bill;
    for (const [i, l] of lines.entries()) {
      if (l.quantity <= 0) continue;
      const line = o.lines[i];
      const it = S.items.find((x) => x.productId === line.productId && (x.variantId || null) === (line.variantId || null));
      addStock(S, L.warehouse, it, l.quantity);
    }
  };
  const payBill = (key, fraction, method, note) => async () => {
    const bill = po[key].bill;
    const amount = Math.round(dirhams(bill.amount) * fraction);
    // A bank payment carries a proof file (required for bank transfers).
    const proofFileId = method === "BANK" ? (await api.upload("/api/files", demoPdf(`Bank transfer ${key}`), `transfer-${key}.pdf`, "application/pdf", owner)).id : undefined;
    await api("POST", `/api/purchase-orders/bills/${bill.id}/payments`, { amount: riyals(amount), method, note, proofFileId }, owner);
  };
  const food = (it) => it.supplier === "gulfPet";
  const care = (it) => it.supplier === "doha";
  const housesInStock = (it) => it.isHouse && it.takesStock;
  at(-30, "08:10", "PO food", createPo("food", "gulfPet", orderLines(food), "Opening order – food"));
  at(-30, "08:20", "PO care", createPo("care", "doha", orderLines(care), "Opening order – litter, hygiene and accessories"));
  at(-30, "09:00", "receive food", receivePo("food"));
  at(-30, "09:20", "receive care", receivePo("care"));
  at(-27, "10:00", "PO houses", createPo("houses", "woodcraft", orderLines(housesInStock), "Ready-made houses for the shop floor"));
  at(-24, "11:30", "receive houses", receivePo("houses"));
  at(-25, "12:00", "pay food bill", payBill("food", 1, "BANK", "Bank transfer"));
  at(-16, "12:00", "pay care bill", payBill("care", 1, "BANK", "Bank transfer"));
  at(-14, "12:30", "pay houses bill (half)", payBill("houses", 0.5, "BANK", "Advance – 50%"));
  at(-12, "10:00", "PO restock", createPo("restock", "gulfPet", orderLines((it) => food(it) && !it.isHouse, 0.5), "Weekly restock"));
  at(-10, "09:30", "receive restock", receivePo("restock"));
  at(-3, "11:00", "pay restock bill (part)", payBill("restock", 0.4, "CASH", "Part payment in cash"));
  at(-4, "10:00", "PO care restock", createPo("careRestock", "doha", orderLines((it) => care(it), 0.6), "Restock – litter and accessories"));
  at(-2, "10:30", "receive care restock (partial)", receivePo("careRestock", 0.5));

  // ---- transfers warehouse -> shop / vans
  const transfer = (to, choose) => async () => {
    const lines = [];
    for (const it of S.items) {
      if (!it.takesStock || it.sellBy === "WEIGHT") continue;
      const have = onHand(S, L.warehouse, it);
      // The warehouse keeps a few of each line (one of each pet house).
      const qty = Math.min(have - (it.isHouse ? 1 : 3), choose(it, have));
      if (qty > 0) lines.push({ item: it, quantity: qty });
    }
    if (!lines.length) return;
    // Transfer record: the van's driver (or the shop cashier) moves it, the owner authorises it;
    // the vehicle defaults to the van's. Cartons where the line is a whole number of them.
    const mover = to === "shop" ? S.staff.cashier : S.staff[to];
    await api("POST", "/api/inventory/transfer", {
      fromBranchId: L.warehouse, toBranchId: L[to],
      ...(mover ? { transferredByUserId: mover } : {}),
      authorisedByUserId: ctx.owner.id,
      items: lines.map((l) => ({ productId: l.item.productId, variantId: l.item.variantId, unit: "PIECE", quantity: l.quantity })),
    }, owner);
    for (const l of lines) {
      addStock(S, L.warehouse, l.item, -l.quantity);
      addStock(S, L[to], l.item, l.quantity);
    }
  };
  // A few lines stay short at the shop so the low-stock list has something to show.
  const lowAtShop = new Set(["scratchPost", "parrotMix", "hamsterMix", "crystalLitter"]);
  const vanGoods = (it) => !it.isHouse && it.price <= 15000 && ["catFood", "dogFood", "litter"].includes(it.cat);
  at(-30, "10:00", "transfer to shop", transfer("shop", (it, have) => (it.isHouse ? have : lowAtShop.has(it.pkey) ? Math.min(3, have) : Math.ceil(have * 0.5))));
  at(-30, "10:20", "transfer to van 1", transfer("van1", (it, have) => (vanGoods(it) ? Math.min(10, Math.floor(have / 4)) : 0)));
  at(-30, "10:30", "transfer to van 2", transfer("van2", (it, have) => (vanGoods(it) ? Math.min(10, Math.floor(have / 4)) : 0)));
  at(-24, "12:15", "transfer houses to shop", transfer("shop", (it, have) => (it.isHouse ? have : 0)));
  at(-18, "09:10", "restock shop", transfer("shop", (it, have) => (it.isHouse || lowAtShop.has(it.pkey) ? 0 : Math.ceil(have * 0.6))));
  at(-15, "08:00", "restock van 1", transfer("van1", (it, have) => (vanGoods(it) ? Math.min(6, Math.floor(have / 4)) : 0)));
  at(-15, "08:10", "restock van 2", transfer("van2", (it, have) => (vanGoods(it) ? Math.min(6, Math.floor(have / 4)) : 0)));
  at(-7, "07:50", "restock van 1", transfer("van1", (it, have) => (vanGoods(it) ? Math.min(6, Math.floor(have / 4)) : 0)));
  at(-7, "07:55", "restock van 2", transfer("van2", (it, have) => (vanGoods(it) ? Math.min(6, Math.floor(have / 4)) : 0)));
  // Low-stock levels: a van re-orders at 2 units; pet houses (one on the floor, one spare) when none is left.
  const setLevel = (loc, item, level) =>
    api("PATCH", `/api/inventory/${item.productId}/${L[loc]}`, { minStockLevel: level, ...(item.variantId ? { variantId: item.variantId } : {}) }, owner);
  at(-30, "10:40", "set van low-stock levels", async () => {
    const list = [];
    for (const loc of ["van1", "van2"]) for (const it of S.items) if (onHand(S, L[loc], it) > 0) list.push([loc, it]);
    await inParallel(list, 6, ([loc, it]) => setLevel(loc, it, 2));
  });
  at(-24, "12:25", "set house low-stock levels", async () => {
    // Show-floor and spare houses: listed as low only when none is left.
    const houses = S.items.filter((it) => it.isHouse && it.takesStock);
    await inParallel([...houses.map((it) => ["shop", it]), ...houses.map((it) => ["warehouse", it])], 6, ([loc, it]) => setLevel(loc, it, 0));
  });
  at(-10, "11:00", "restock shop", transfer("shop", (it, have) => (it.isHouse || lowAtShop.has(it.pkey) ? 0 : Math.ceil(have * 0.7))));
  at(-2, "12:00", "restock shop", transfer("shop", (it, have) => (it.isHouse || lowAtShop.has(it.pkey) ? 0 : Math.ceil(have * 0.5))));

  // ---- customers
  const webCustomers = C.CUSTOMERS.filter((c) => c.web);
  const walkIns = C.CUSTOMERS.filter((c) => !c.web);
  webCustomers.forEach((c, i) => {
    at(-29 + i, `${String(between(18, 22)).padStart(2, "0")}:${String(between(0, 59)).padStart(2, "0")}`, `register ${c.email}`, async () => {
      const password = crypto.randomBytes(24).toString("base64url");
      const reg = await api("POST", "/api/shop/register", { name: c.name, email: c.email, password, phone: c.phone, locale: c.locale });
      // The confirmation link is in the (never sent) e-mail; open it the way the customer would.
      const mail = await ctx.base.emailOutbox.findFirst({ where: { toEmail: c.email }, orderBy: { createdAt: "desc" }, select: { text: true } });
      const token = /token=([a-f0-9]+)/.exec(mail?.text || reg.verifyLink || "")?.[1];
      if (!token) throw new Error(`no confirmation link for ${c.email}`);
      await api("POST", "/api/shop/verify", { token });
      const row = await ctx.base.customer.findUnique({ where: { id: reg.id }, select: { id: true, sessionVersion: true } });
      const ctok = ctx.signToken({ sub: row.id, role: "CUSTOMER", organizationId: ctx.org.id, sv: row.sessionVersion ?? 0 }, "30d");
      S.customers[c.key] = { id: row.id, token: ctok, def: c, pets: {}, since: stepAt() };
      for (const p of c.pets) {
        const pet = await api("POST", "/api/shop/me/pets", { name: p.name, breed: p.breed, ageText: p.ageText, petTypeId: S.pet[p.type] }, ctok);
        S.customers[c.key].pets[p.name] = pet.id;
      }
      await api("POST", "/api/shop/me/addresses", { label: "Home", line1: c.address, area: c.area, city: "Doha", isDefault: true }, ctok);
    });
  });
  walkIns.forEach((c, i) => {
    at(-28 + i * 2, "10:05", `customer at the till ${c.email}`, async () => {
      const row = await staffCall("cashier", "POST", "/api/customers", { name: c.name, phone: c.phone, email: c.email, address: `${c.address}, Doha` });
      S.customers[c.key] = { id: row.id, def: c, pets: {}, since: stepAt() };
      for (const p of c.pets) {
        const pet = await staffCall("cashier", "POST", `/api/customers/${row.id}/pets`, { name: p.name, breed: p.breed, ageText: p.ageText, petTypeId: S.pet[p.type] });
        S.customers[c.key].pets[p.name] = pet.id;
      }
      await staffCall("cashier", "POST", `/api/customers/${row.id}/addresses`, { label: "Home", line1: c.address, area: c.area, city: "Doha", isDefault: true });
    });
  });
  const anyCustomer = () => {
    const keys = Object.keys(S.customers).filter((k) => S.customers[k].since <= stepAt());
    return keys.length ? S.customers[pick(keys)].id : null;
  };

  // ---- till: shop every day, vans on some days
  const session = {};
  // Cash expected in each open drawer, counted the way the app does (float + cash taken − cash refunded),
  // so the close needs no extra request.
  const drawer = {};
  const openTill = (loc, who, float) => async () => {
    const r = await staffCall(who, "POST", "/api/cash-sessions/open", { branchId: L[loc], openingFloat: float });
    session[loc] = r.id;
    drawer[loc] = dirhams(float);
  };
  const closeTill = (loc, who) => async () => {
    const id = session[loc];
    if (!id) return;
    const expected = drawer[loc] || 0;
    const variance = rand() < 0.2 ? pick([-500, -200, 100, 300]) : 0;
    await staffCall(who, "POST", `/api/cash-sessions/${id}/close`, {
      closingCountedCash: riyals(Math.max(0, expected + variance)),
      note: variance ? "Counted at close" : null,
    });
    session[loc] = null;
  };
  const sale = (loc, who, opts = {}) => async () => {
    const lines = basket(S, L[loc], opts.lines || pick([1, 2, 2, 3]), { houses: opts.houses, weight: loc === "shop", keep: loc === "shop" ? 6 : 3 });
    if (!lines.length) return;
    const goods = lines.reduce((s, l) => s + (l.item.sellBy === "WEIGHT" ? Math.round((l.item.price * l.quantity) / 1000) : l.item.price * l.quantity), 0);
    const body = {
      branchId: L[loc],
      items: lines.map((l) => ({ productId: l.item.productId, variantId: l.item.variantId, quantity: l.quantity })),
      paymentMethod: opts.method || "CASH",
      clientMutationId: `demo-${crypto.randomUUID()}`,
    };
    if (opts.customer || rand() < 0.35) body.customerId = opts.customer || anyCustomer();
    if (!body.customerId) delete body.customerId;
    if (opts.coupon && goods >= 10000) body.couponCode = "WELCOME15";
    if (["FAWRAN", "PAYMENT_LINK"].includes(body.paymentMethod)) body.paymentReference = `${body.paymentMethod === "FAWRAN" ? "FWR" : "PL"}${between(100000, 999999)}`;
    if (opts.method === "SPLIT") {
      const total = await atClock(stepAt(), () => quoteTill(ctx, lines, goods, body.couponCode));
      const cash = Math.min(total - 100, Math.max(100, Math.round(total * 0.4 / 100) * 100));
      if (total < 300) body.paymentMethod = "CASH";
      else {
        body.paymentMethod = "SPLIT";
        body.paymentSplits = [{ method: "CASH", amount: riyals(cash) }, { method: "CARD", amount: riyals(total - cash) }];
      }
    }
    for (const l of lines) addStock(S, L[loc], l.item, -l.quantity);
    let r;
    try {
      r = await staffCall(who, "POST", "/api/sales/checkout", body);
    } catch (e) {
      for (const l of lines) addStock(S, L[loc], l.item, l.quantity);
      throw e;
    }
    S.sales.push({ id: r.id, loc, at: stepAt(), method: r.paymentMethod, items: r.items, total: r.total });
    if (body.paymentMethod === "CASH") drawer[loc] = (drawer[loc] || 0) + dirhams(r.amountPaid ?? r.total);
    if (body.paymentMethod === "SPLIT") drawer[loc] = (drawer[loc] || 0) + dirhams(body.paymentSplits[0].amount);
  };
  const tillMethods = ["CASH", "CASH", "CARD", "CARD", "CARD", "SPLIT"];
  const vanMethods = ["CASH", "CASH", "CARD", "FAWRAN", "PAYMENT_LINK"];
  for (let day = -29; day <= 0; day += 1) {
    const friday = weekdayOf(day) === 5;
    const open = friday ? 14 * 60 : 9 * 60 + 30;
    const close = 21 * 60 + 45;
    at(day, hhmm(open), "open shop till", openTill("shop", "cashier", "500.00"));
    // 3 sales a day, 3–5 in the last ten days (kept modest so the load stays short when the database is far away).
    const n = day >= -9 ? between(3, 5) : 3;
    const times = Array.from({ length: n }, () => between(open + 15, close - 20)).sort((a, b) => a - b);
    times.forEach((m, i) => {
      const method = pick(tillMethods);
      at(day, hhmm(m), `shop sale ${day}/${i}`, sale("shop", "cashier", { method, coupon: rand() < 0.08, houses: rand() < 0.03 }));
    });
    if (day < 0) at(day, hhmm(close), "close shop till", closeTill("shop", "cashier"));
  }
  const vanDays = [[-28, "van1"], [-27, "van2"], [-25, "van2"], [-23, "van1"], [-21, "van2"], [-20, "van1"], [-17, "van1"], [-16, "van2"], [-13, "van2"], [-11, "van1"], [-10, "van2"], [-8, "van2"], [-6, "van1"], [-5, "van1"], [-3, "van2"], [-2, "van1"], [-1, "van2"]];
  for (const [day, van] of vanDays) {
    if (weekdayOf(day) === 5) continue;
    at(day, "08:30", `open ${van} till`, openTill(van, van, "200.00"));
    const n = between(2, 4);
    for (let i = 0; i < n; i += 1) {
      at(day, hhmm(9 * 60 + i * 75 + between(0, 50)), `${van} sale ${day}/${i}`, sale(van, van, { method: pick(vanMethods), lines: between(1, 2) }));
    }
    at(day, "14:00", `close ${van} till`, closeTill(van, van));
  }

  // ---- van returns: goods a driver collects back from a customer (some still in the van, some
  // received at the warehouse, one with a damaged line and its photo; paid in cash or by bank with a
  // proof file, and one unpaid).
  const vr = {};
  // The cheaper van lines (what is paid back in cash must fit in the van's drawer).
  const returnGoods = () => S.items.filter((it) => vanGoods(it) && it.sellBy !== "WEIGHT" && it.takesStock && it.price <= 5000).sort((a, b) => a.price - b.price || a.key.localeCompare(b.key));
  const demoPhoto = async () => {
    const { default: sharp } = await import("sharp");
    const buf = await sharp({ create: { width: 160, height: 120, channels: 3, background: { r: 176, g: 120, b: 72 } } })
      .composite([{ input: Buffer.from('<svg width="160" height="120"><path d="M20 20 L140 100 M140 20 L20 100" stroke="#5a2d0c" stroke-width="10"/></svg>'), top: 0, left: 0 }])
      .jpeg({ quality: 80 }).toBuffer();
    return { dataBase64: buf.toString("base64") };
  };
  const demoProof = () => ({
    fileName: "bank-transfer-receipt.pdf",
    dataBase64: Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n").toString("base64"),
  });
  const vanReturn = (key, van, { lines, customer, payment }) => async () => {
    const goods = returnGoods();
    if (!goods.length) return;
    const body = {
      vanBranchId: L[van],
      customerName: customer.name, customerPhone: customer.phone,
      ...(S.staff[van] ? { collectedByUserId: S.staff[van] } : {}),
      lines: await Promise.all(lines.map(async (l, i) => ({
        productId: goods[(l.pick + i) % goods.length].productId,
        variantId: goods[(l.pick + i) % goods.length].variantId,
        unit: "PIECE", quantity: l.quantity, condition: l.condition,
        ...(l.condition === "DAMAGED" ? { photo: await demoPhoto() } : {}),
      }))),
      note: customer.note,
    };
    body.amountOwed = riyals(body.lines.reduce((sum, l) => sum + (goods.find((g) => g.productId === l.productId && g.variantId === l.variantId)?.price || 0) * l.quantity, 0));
    if (payment) body.payment = { method: payment, ...(payment === "BANK" ? { reference: `FT${between(100000, 999999)}`, proof: demoProof() } : {}) };
    const row = await staffCall(van, "POST", "/api/van-returns", body);
    vr[key] = row;
    if (row.cashSessionId) drawer[van] = (drawer[van] || 0) - dirhams(row.amountOwed);
  };
  const receiveReturn = (key) => async () => {
    if (!vr[key]) return;
    vr[key] = await api("POST", `/api/van-returns/${vr[key].id}/receive`, { version: vr[key].version, branchId: L.warehouse }, owner);
    // Good lines are back in the warehouse's sellable stock (damaged ones are kept apart).
    for (const line of vr[key].lines || []) {
      if (line.condition !== "GOOD") continue;
      const it = S.items.find((x) => x.productId === line.product?.id && (x.variantId || null) === (line.variant?.id || null));
      if (it) addStock(S, L.warehouse, it, line.baseQty);
    }
  };
  const payReturn = (key, van, method) => async () => {
    if (!vr[key] || vr[key].paymentStatus === "PAID") return;
    const row = await staffCall(van, "POST", `/api/van-returns/${vr[key].id}/pay`, {
      version: vr[key].version, method, ...(method === "BANK" ? { reference: `FT${between(100000, 999999)}`, proof: demoProof() } : {}),
    });
    vr[key] = row;
    if (row.cashSessionId) drawer[van] = (drawer[van] || 0) - dirhams(row.amountOwed);
  };
  const vanDay = (van, from) => vanDays.filter(([d, v]) => v === van && d >= from && weekdayOf(d) !== 5)[0]?.[0];
  {
    const d1 = vanDay("van1", -20), d2 = vanDay("van2", -16), d3 = vanDay("van1", -11), d4 = vanDay("van1", -6);
    if (d1 != null) at(d1, "11:40", "van1 return (good, paid cash)", vanReturn("a", "van1", { customer: { name: "Fatima Al Kuwari", phone: "+974 5000 2101", note: "Wrong flavour, unopened" }, lines: [{ pick: 0, quantity: 2, condition: "GOOD" }], payment: "CASH" }));
    if (d2 != null) {
      at(d2, "12:10", "van2 return (good + damaged)", vanReturn("b", "van2", { customer: { name: "Ahmed Al Marri", phone: "+974 5000 2102", note: "One bag torn on delivery" }, lines: [{ pick: 1, quantity: 1, condition: "GOOD" }, { pick: 2, quantity: 1, condition: "DAMAGED" }] }));
      at(d2, "13:40", "van2 receive return at warehouse", receiveReturn("b"));
      at(d2, "13:45", "van2 pay return by bank", payReturn("b", "van2", "BANK"));
    }
    if (d3 != null) at(d3, "12:20", "van1 return (still in the van, unpaid)", vanReturn("c", "van1", { customer: { name: "Sara Ibrahim", phone: "+974 5000 2103", note: "Ordered twice" }, lines: [{ pick: 3, quantity: 1, condition: "GOOD" }] }));
    if (d4 != null) {
      at(d4, "10:50", "van1 return (received, paid later)", vanReturn("d", "van1", { customer: { name: "Mohammed Hassan", phone: "+974 5000 2104", note: "Customer moved away" }, lines: [{ pick: 4, quantity: 2, condition: "GOOD" }] }));
      at(d4, "12:30", "van1 receive return at warehouse", receiveReturn("d"));
      at(d4, "13:10", "van1 pay return in cash", payReturn("d", "van1", "CASH"));
    }
  }

  // ---- till refunds: one money-only, one with the goods returned
  const refund = (fromDay, restock, method, note) => async () => {
    const pool = S.sales.filter((s) => s.loc === "shop" && s.items?.length && (method === "CARD" ? s.method === "CARD" : s.method === "CASH"));
    const target = pool.filter((s) => s.day === fromDay).pop() || pool.pop();
    if (!target) return;
    const line = target.items[0];
    const rf = await api("POST", "/api/refunds", {
      branchId: L.shop, saleId: target.id, items: [{ saleItemId: line.id, quantity: 1 }], restock, method, note,
      clientMutationId: `demo-${crypto.randomUUID()}`,
    }, owner);
    if (method === "CASH") drawer.shop = (drawer.shop || 0) - dirhams(rf.total);
    if (restock) addStock(S, L.shop, S.items.find((it) => it.productId === line.productId && (it.variantId || null) === (line.variantId || null)), 1);
  };
  at(-15, "18:40", "till refund (money only)", refund(-15, false, "CASH", "Customer changed mind – bag opened, not resellable"));
  at(-6, "17:10", "till refund (goods returned)", refund(-8, true, "CARD", "Wrong size – returned unopened"));
  // Remember which day each sale was made (for the refunds above).
  const saleStep = plan.filter((p) => p.label.startsWith("shop sale "));
  for (const p of saleStep) {
    const run = p.run;
    const day = Number(p.label.split(" ")[2].split("/")[0]);
    p.run = async () => {
      const before = S.sales.length;
      await run();
      if (S.sales.length > before) S.sales[S.sales.length - 1].day = day;
    };
  }

  // ---- website orders through the (mock) card gateway
  const pay = async (custom1, { statusId = 2, amountOverride = null } = {}) => {
    const g = gateway.byCustom(custom1);
    if (!g) throw new Error(`no gateway payment for ${custom1}`);
    const body = { PaymentId: g.id, Amount: amountOverride || g.amount, StatusId: statusId, TransactionId: g.transactionId, Custom1: custom1 };
    gateway.setStatus(g.id, statusId);
    const sig = crypto
      .createHmac("sha256", process.env.SKIPCASH_WEBHOOK_KEY)
      .update(["PaymentId", "Amount", "StatusId", "TransactionId", "Custom1", "VisaId"].filter((k) => body[k] != null && body[k] !== "").map((k) => `${k}=${body[k]}`).join(","))
      .digest("base64");
    return api("POST", "/api/shop/payments/skipcash", body, null, { headers: { Authorization: sig } });
  };
  const web = {};
  const order = (key, day, time, cust, lines, opt = {}) => {
    at(day, time, `web order ${key}`, async () => {
      const c = S.customers[cust];
      if (!c?.token) throw new Error(`customer ${cust} is not registered`);
      const items = lines.map(([k, q]) => ({ item: item(k), quantity: q }));
      for (const l of items) if (l.item.takesStock && onHand(S, L.shop, l.item) < l.quantity) throw new Error(`not enough ${l.item.label} at the shop`);
      const body = {
        fulfillment: opt.pickup ? "PICKUP" : "DELIVERY", name: c.def.name, phone: c.def.phone, locale: c.def.locale,
        items: items.map((l) => ({ productId: l.item.productId, variantId: l.item.variantId, quantity: l.quantity })),
        ...(opt.code ? { code: opt.code } : {}),
        ...(opt.pickup ? {} : { address: c.def.address, areaId: S.area[c.def.area], deliveryDate: qDay(opt.deliverDay ?? day + 1, now), windowId: S.windows[opt.window ?? 1] }),
      };
      for (const l of items) if (l.item.takesStock) addStock(S, L.shop, l.item, -l.quantity);
      try {
        const r = await api("POST", "/api/shop/checkout", body, c.token);
        web[key] = { id: r.orderId, items, pickup: opt.pickup };
      } catch (e) {
        for (const l of items) if (l.item.takesStock) addStock(S, L.shop, l.item, l.quantity);
        throw e;
      }
    }, { optional: true });
    if (opt.review) {
      at(day, addMin(time, 2), `payment fails ${key}`, async () => {
        if (!web[key]) return;
        await pay(web[key].id, { statusId: 4 });
        for (const l of web[key].items) if (l.item.takesStock) addStock(S, L.shop, l.item, l.quantity);
      });
      at(day, addMin(time, 9), `late payment ${key}`, async () => web[key] && pay(web[key].id));
      return;
    }
    at(day, addMin(time, 3), `payment ${key}`, async () => web[key] && pay(web[key].id));
    const steps = opt.steps || [];
    for (const [d2, t2, status] of steps) {
      at(d2, t2, `order ${key} -> ${status}`, async () => web[key] && api("POST", `/api/online-orders/${web[key].id}/status`, { status }, owner));
    }
    if (opt.refund) {
      const [d3, t3] = opt.refund;
      at(d3, t3, `refund order ${key}`, async () => {
        if (!web[key]) return;
        const o = await ctx.base.sale.findUnique({ where: { id: web[key].id }, select: { amountPaid: true } });
        await api("POST", `/api/online-orders/${web[key].id}/refund`, { amount: riyals(o.amountPaid), restock: true }, owner);
        for (const l of web[key].items) if (l.item.takesStock) addStock(S, L.shop, l.item, l.quantity);
      });
    }
  };
  const delivered = (d, out = "15:10", done = "17:40") => [[d, "10:00", "PREPARING"], [d, out, "OUT_FOR_DELIVERY"], [d, done, "DELIVERED"]];
  const collected = (d, ready = "12:00", done = "18:30") => [[d, "10:30", "PREPARING"], [d, ready, "READY_FOR_PICKUP"], [d, done, "COLLECTED"]];
  order("w1", -26, "10:15", "noora", [["adultCat:4 kg", 1], ["wetPouch", 6]], { steps: delivered(-25), deliverDay: -25 });
  order("w2", -24, "20:40", "ahmed", [["adultDog:12 kg", 1], ["dentalChews", 1]], { steps: delivered(-23), deliverDay: -23, window: 2 });
  order("w3", -22, "13:05", "sarah", [["kittenDry:2 kg", 1], ["featherWand", 1]], { pickup: true, steps: collected(-22, "15:00", "19:20").map((s, i) => (i === 0 ? [s[0], "13:40", s[2]] : s)) });
  order("w4", -20, "09:50", "fatima", [["budgieSeed", 2], ["parrotMix", 1]], { steps: delivered(-19), deliverDay: -19, window: 0 });
  order("w5", -19, "21:10", "khalid", [["hutch", 1], ["timothyHay", 2]], { steps: delivered(-17, "11:00", "13:30"), deliverDay: -17, window: 0 });
  order("w6", -17, "11:30", "emma", [["dentalChews", 1], ["ropeToy", 1], ["collar:Medium", 1]], { pickup: true, steps: collected(-16) });
  order("w7", -15, "16:45", "noora", [["capsule", 1]], { steps: [[-14, "09:30", "PREPARING"], [-1, "09:00", "OUT_FOR_DELIVERY"], [-1, "13:15", "DELIVERED"]], deliverDay: -1, window: 0 });
  order("w8", -13, "12:20", "priya", [["clumpLitter:10 L", 2], ["crystalLitter", 1]], { steps: delivered(-12), deliverDay: -12 });
  order("w9", -11, "19:35", "omar", [["adultDog:3 kg", 1], ["wetDog", 6]], { steps: delivered(-10, "18:20", "19:45"), deliverDay: -10, window: 2 });
  order("w10", -8, "10:05", "hessa", [["kittenDry:4 kg", 1], ["catTreats", 2]], { code: "WELCOME15", steps: [[-8, "14:50", "CANCELLED"]], refund: [-8, "15:05"], deliverDay: -7 });
  order("w11", -5, "14:30", "sarah", [["wetPouch", 6], ["clumpLitter:5 L", 1]], { steps: delivered(-4), deliverDay: -4 });
  order("w12", -3, "22:15", "emma", [["puppyDry", 1]], { review: true, deliverDay: -1 });
  order("w13", -1, "18:20", "omar", [["wetDog", 12], ["dentalChews", 1]], { steps: [[-1, "20:30", "PREPARING"], [0, "09:45", "OUT_FOR_DELIVERY"]], deliverDay: 0, window: 0 });
  order("w14", 0, "08:10", "noora", [["adultCat:1.5 kg", 1], ["catTreats", 1]], { pickup: true, steps: [[0, "09:40", "PREPARING"]] });
  order("w15", 0, "09:05", "priya", [["kittenDry:400 g", 2], ["featherWand", 1]], { deliverDay: 1, window: 2 });
  order("w16", -6, "12:10", "fatima", [["aviary", 1], ["budgieSeed", 1]], { steps: delivered(-4, "10:30", "12:30"), deliverDay: -4, window: 0 });

  // ---- grooming (booked and paid on the website; staff run the day)
  const bookings = [
    ["g1", -25, "11:00", "noora", "Luna", "catBasic", "done"],
    ["g2", -22, "10:00", "ahmed", "Max", "dogFull", "done"],
    ["g3", -20, "15:00", "sarah", "Coco", "dogBasic", "done"],
    ["g4", -16, "12:00", "khalid", "Shadow", "catFull", "done"],
    ["g5", -13, "11:00", "emma", "Bella", "dogBasic", "done"],
    ["g6", -11, "14:00", "omar", "Rocky", "dogFull", "done"],
    ["g7", -9, "16:00", "priya", "Oreo", "catBasic", "noshow"],
    ["g8", -6, "10:00", "hessa", "Lulu", "catBasic", "done"],
    ["g9", -4, "14:00", "noora", "Simba", "catFull", "done"],
    ["g10", -2, "13:00", "sarah", "Milo", "catBasic", "done"],
    ["g11", 0, null, "ahmed", "Max", "dogBasic", "upcoming"],
    ["g12", 1, "10:00", "emma", "Bella", "dogFull", "upcoming"],
    ["g13", 1, "15:00", "khalid", "Shadow", "catBasic", "upcoming"],
  ];
  const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  /** The bookable slot (on the shop's grooming hours) nearest to the wanted day and time. */
  const fitSlot = (day0, time, duration) => {
    for (let back = 0; back < 7; back += 1) {
      const day = day0 - back;
      if (weekdayOf(day) === 5 && back < 6) continue; // the demo keeps Fridays for walk-ins
      let best = null;
      for (const h of S.schedule.filter((r) => r.weekday === weekdayOf(day))) {
        for (let m = toMin(h.startTime); m + duration <= toMin(h.endTime); m += duration) {
          if (!best || Math.abs(m - toMin(time)) < Math.abs(best - toMin(time))) best = m;
        }
      }
      if (best != null) return { day, time: hhmm(best) };
    }
    return null;
  };
  for (const [key, day0, time0, cust, petName, pkgKey, outcome] of bookings) {
    const pkg = S.pkg[pkgKey];
    let day = day0;
    let time = time0;
    if (outcome !== "upcoming") {
      const fit = fitSlot(day0, time0, pkg.durationMin);
      if (!fit) continue;
      ({ day, time } = fit);
    }
    const bookDay = Math.min(day - 2, -1);
    at(bookDay, "20:30", `grooming booking ${key}`, async () => {
      const c = S.customers[cust];
      if (!c?.token) throw new Error(`customer ${cust} is not registered`);
      const pet = c.def.pets.find((p) => p.name === petName);
      // On the booking evening the customer picks a free slot for that day (upcoming bookings:
      // only a slot still ahead of the real clock).
      const slots = await api("GET", `/api/shop/grooming/availability?date=${qDay(day, now)}&packageId=${pkg.id}`, null, c.token);
      const want = time ? qAt(day, time, now).toISOString() : null;
      const ahead = (x) => outcome !== "upcoming" || new Date(x.startAt).getTime() > now.getTime() + 30 * 60000;
      const slot = (want && slots.find((x) => x.startAt === want && ahead(x))) || (outcome === "upcoming" ? slots.find(ahead) : null);
      if (!slot) throw new Error("no free grooming slot");
      const r = await api("POST", "/api/shop/grooming/book", {
        packageId: pkg.id, startAt: slot.startAt, name: c.def.name, phone: c.def.phone, petName, breed: pet.breed, ageText: pet.ageText, visitKind: "SHOP",
        note: outcome === "upcoming" ? "Please use the hypoallergenic shampoo" : null,
      }, c.token);
      web[key] = { id: r.bookingId };
      await pay(`booking:${r.bookingId}`);
    }, { optional: true });
    if (outcome === "done") {
      const startMin = Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
      at(day, hhmm(startMin), `grooming ${key} starts`, async () => web[key] && staffCall("cashier", "PATCH", `/api/appointments/${web[key].id}`, { status: "IN_PROGRESS" }));
      at(day, hhmm(startMin + pkg.durationMin - 5), `grooming ${key} done`, async () => web[key] && staffCall("cashier", "PATCH", `/api/appointments/${web[key].id}`, { status: "DONE" }));
    } else if (outcome === "noshow") {
      const startMin = Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
      at(day, hhmm(startMin + 40), `grooming ${key} no-show`, async () => web[key] && staffCall("cashier", "PATCH", `/api/appointments/${web[key].id}`, { status: "NO_SHOW" }));
    }
  }

  // ---- pet relocation requests
  const relocation = (key, day, time, cust, petNames, destination, steps) => {
    at(day, time, `relocation ${key}`, async () => {
      const c = S.customers[cust];
      const r = await api("POST", "/api/shop/relocation", {
        destination, petIds: petNames.map((n) => c.pets[n]),
        documents: [{ fileName: "vaccination-record.pdf", dataBase64: C.demoPdf(`Vaccination record - ${petNames.join(", ")} (demo)`).toString("base64") }],
      }, c.token);
      web[key] = { id: r.id };
    });
    for (const [d2, t2, step, extra] of steps) {
      at(d2, t2, `relocation ${key} ${step}`, async () => {
        if (!web[key]) return;
        const id = web[key].id;
        if (step === "QUOTE") {
          const row = await ctx.base.relocationRequest.findUnique({ where: { id }, select: { version: true } });
          await api("POST", `/api/relocation/${id}/quote`, { amount: extra.amount, note: extra.note, version: row.version }, owner);
        } else if (step === "PAY") {
          await api("POST", `/api/relocation/${id}/pay`, { method: "BANK", reference: extra.reference }, owner);
        } else {
          await api("POST", `/api/relocation/${id}/status`, { status: step, note: extra?.note || "" }, owner);
        }
      });
    }
  };
  relocation("r1", -24, "21:00", "sarah", ["Milo", "Coco"], "London, United Kingdom", [
    [-23, "10:30", "UNDER_REVIEW"],
    [-22, "11:15", "QUOTE", { amount: "4800.00", note: "Includes IATA crates, health certificate and cargo to LHR" }],
    [-20, "12:40", "PAY", { reference: "QNB-TRF-558201" }],
    [-18, "09:30", "IN_PROGRESS", { note: "Vet appointment booked for health certificate" }],
  ]);
  relocation("r2", -12, "20:10", "emma", ["Bella"], "Sydney, Australia", [
    [-11, "11:00", "UNDER_REVIEW"],
    [-10, "16:20", "QUOTE", { amount: "6500.00", note: "Includes rabies titre test, import permit and 10-day quarantine booking" }],
  ]);
  relocation("r3", -2, "19:30", "priya", ["Oreo"], "Kochi, India", []);

  // ---- expenses
  const expense = (day, time, category, amount, paidFrom, description) =>
    at(day, time, `expense ${description}`, async () => api("POST", "/api/expenses", { category, amount, paidFrom, description, expenseDate: qDay(day) }, owner));
  expense(-28, "11:00", "RENT", "9500.00", "BANK", "Shop rent – Al Waab (monthly)");
  expense(-28, "11:05", "RENT", "3500.00", "BANK", "Warehouse rent – Industrial Area (monthly)");
  expense(-20, "12:10", "ELECTRICITY", "980.50", "BANK", "Kahramaa – shop electricity and water");
  expense(-20, "12:12", "ELECTRICITY", "410.00", "BANK", "Kahramaa – warehouse electricity");
  expense(-22, "16:30", "OTHER", "185.00", "CASH", "Supplies – cleaning products and receipt rolls");
  expense(-8, "16:45", "OTHER", "96.50", "CASH", "Supplies – carrier bags and packing tape");
  for (const [d, amt] of [[-27, "140.00"], [-20, "155.00"], [-13, "150.00"], [-6, "160.00"]]) expense(d, "08:15", "OTHER", amt, "CASH", "Fuel – sales vans");

  // ---- sales orders, free goods, bank transfers, PO quotation / prepayment / freight (scripts/demo/salesOrders.mjs)
  planSalesOrdersDemo({ at, api, owner, S, L, plan, addStock, onHand, basket, qDay, riyals, upload: api.upload });
  // ---- B2B / Wholesale: paid, invoiced-unpaid, delivered-not-invoiced (scripts/demo/b2b.mjs, fix-ra)
  planB2bDemo({ at, api, T, owner, S, L, addStock, onHand, qDay, upload: api.upload });
  // ---- fix-rb: vans and drivers, dispatch, driver change requests, grooming vans (scripts/demo/dispatch.mjs)
  planDispatchDemo({ at, api, owner, S, L, ctx, basket, addStock, qDay });

  return plan;
}

async function inParallel(list, limit, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, list.length) }, async () => {
    while (i < list.length) await fn(list[i++]);
  }));
}

function addMin(time, minutes) {
  const [h, m] = time.split(":").map(Number);
  return hhmm(Math.min(23 * 60 + 59, h * 60 + m + minutes));
}

/** The till total the app will charge, from the app's own promotion rules (for split tenders). */
async function quoteTill(ctx, lines, goods, couponCode) {
  const { quotePromotions } = await import("../src/lib/promotions.js");
  const promo = await quotePromotions(ctx.base, {
    organizationId: ctx.org.id,
    channel: "TILL",
    lines: lines.map((l) => ({
      productId: l.item.productId,
      categoryId: ctx.S.cat[l.item.cat] || null,
      quantity: l.quantity,
      subtotal: l.item.sellBy === "WEIGHT" ? Math.round((l.item.price * l.quantity) / 1000) : l.item.price * l.quantity,
      sellBy: l.item.sellBy,
    })),
    goods,
    code: couponCode || null,
  });
  return Math.max(0, goods - promo.discount);
}

// ------------------------------------------------------------------ main

export async function main(cmd = command) {
  if (!process.env.DATABASE_URL) {
    log("DATABASE_URL is not set; nothing to do.");
    return { skipped: true };
  }
  if (cmd === "status") return status();
  if (cmd === "remove") return removeDemo();
  if (cmd === "load") return load();
  console.log("usage: node scripts/demo-data.mjs load|remove|status");
  process.exitCode = 2;
  return null;
}

const isCli = import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("demo-data.mjs");
if (isCli) {
  main()
    .then(() => process.exit(process.exitCode || 0))
    .catch((e) => {
      console.error("[demo] failed:", e?.message || e);
      process.exit(1);
    });
}
