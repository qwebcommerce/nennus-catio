/**
 * Bookkeeping for demo data: which rows are demo rows (DemoRecord), finding the rows the
 * application created indirectly (by following foreign keys from the rows the loader created),
 * and deleting them again.
 *
 * Works on table/column names read from the database catalog, so new tables that hang off demo
 * rows are found without changing this file.
 */

const LOAD = "_load"; // DemoRecord.entityType of the loader's own state row
const LOAD_ID = "current";

const ident = (name) => `"${String(name).replace(/"/g, '""')}"`;

/** Rows owned by a parent: if one is demo, the whole parent is (a sale is not kept without some of its lines). */
const OWNED_BY = {
  SaleItem: ["saleId", "Sale"],
  StockHold: ["saleId", "Sale"],
  RefundItem: ["refundId", "Refund"],
  PurchaseOrderLine: ["orderId", "PurchaseOrder"],
  RelocationPet: ["requestId", "RelocationRequest"],
};

export class DemoRecords {
  constructor(db, log = console.log) {
    this.db = db;
    this.log = log;
    this._schema = null;
  }

  q(sql, ...params) {
    return this.db.$queryRawUnsafe(sql, ...params);
  }

  async ensureTable() {
    const rows = await this.q(`SELECT to_regclass('public."DemoRecord"')::text AS t`);
    if (!rows[0]?.t) {
      throw new Error('The "DemoRecord" table is missing. Run `prisma migrate deploy` first (migration 20261119103000_demo_data).');
    }
  }

  /** Foreign keys, primary keys and timestamp columns of the public schema. */
  async schema() {
    if (this._schema) return this._schema;
    const fks = await this.q(`
      SELECT cl.relname AS child, pcl.relname AS parent, c.confdeltype::text AS ondelete,
             a.attname AS col, pa.attname AS pcol
      FROM pg_constraint c
      JOIN pg_class cl ON cl.oid = c.conrelid
      JOIN pg_class pcl ON pcl.oid = c.confrelid
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
      JOIN pg_attribute pa ON pa.attrelid = c.confrelid AND pa.attnum = c.confkey[1]
      WHERE c.contype = 'f' AND array_length(c.conkey, 1) = 1
        AND c.connamespace = 'public'::regnamespace`);
    const pkRows = await this.q(`
      SELECT cl.relname AS t, array_agg(a.attname::text ORDER BY array_position(c.conkey, a.attnum)) AS cols
      FROM pg_constraint c
      JOIN pg_class cl ON cl.oid = c.conrelid
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
      WHERE c.contype = 'p' AND c.connamespace = 'public'::regnamespace
      GROUP BY cl.relname`);
    const cols = await this.q(`
      SELECT table_name AS t, column_name AS c, data_type AS type
      FROM information_schema.columns WHERE table_schema = 'public'`);
    const pk = new Map(pkRows.map((r) => [r.t, r.cols]));
    const times = new Map();
    const columns = new Map();
    for (const r of cols) {
      if (!columns.has(r.t)) columns.set(r.t, new Set());
      columns.get(r.t).add(r.c);
      if (String(r.type).startsWith("timestamp")) {
        if (!times.has(r.t)) times.set(r.t, []);
        times.get(r.t).push(r.c);
      }
    }
    this._schema = { fks, pk, times, columns };
    return this._schema;
  }

  // ---------------------------------------------------------------- DemoRecord rows

  async loadState() {
    const rows = await this.q(`SELECT meta FROM "DemoRecord" WHERE "entityType" = $1 AND "entityId" = $2`, LOAD, LOAD_ID);
    return rows[0]?.meta || null;
  }

  /** Claims the loader state row. Returns false when another load holds it. */
  async claimLoad(meta) {
    const rows = await this.q(
      `INSERT INTO "DemoRecord" ("id", "entityType", "entityId", "meta") VALUES ($1, $2, $3, $4::jsonb)
       ON CONFLICT ("entityType", "entityId") DO NOTHING RETURNING "id"`,
      `dr_${LOAD}`, LOAD, LOAD_ID, JSON.stringify(meta),
    );
    return rows.length > 0;
  }

  async saveState(meta) {
    await this.q(
      `UPDATE "DemoRecord" SET "meta" = $3::jsonb WHERE "entityType" = $1 AND "entityId" = $2 RETURNING "id"`,
      LOAD, LOAD_ID, JSON.stringify(meta),
    );
  }

  /** Map table -> Set(key) of every recorded demo row (key = id, or JSON of a composite key). */
  async recorded() {
    const rows = await this.q(`SELECT "entityType" AS t, "entityId" AS id FROM "DemoRecord" WHERE "entityType" <> $1`, LOAD);
    const map = new Map();
    for (const r of rows) {
      if (!map.has(r.t)) map.set(r.t, new Set());
      map.get(r.t).add(r.id);
    }
    return map;
  }

  /** Writes rows into DemoRecord (idempotent). entries: [table, key][] */
  async record(entries) {
    const seen = new Set();
    const list = [];
    for (const [t, k] of entries) {
      if (!t || k == null) continue;
      const key = `${t}\u0000${k}`;
      if (seen.has(key)) continue;
      seen.add(key);
      list.push([t, String(k)]);
    }
    for (let i = 0; i < list.length; i += 5000) {
      const part = list.slice(i, i + 5000);
      await this.q(
        `INSERT INTO "DemoRecord" ("id", "entityType", "entityId")
         SELECT 'dr_' || md5(t || ':' || e), t, e FROM unnest($1::text[], $2::text[]) AS x(t, e)
         ON CONFLICT ("entityType", "entityId") DO NOTHING`,
        part.map((x) => x[0]),
        part.map((x) => x[1]),
      );
    }
    return list.length;
  }

  // ---------------------------------------------------------------- closure

  /**
   * All rows that belong to the demo: the seed rows, every row that points at a demo row through a
   * foreign key that would block or cascade a delete (and audit rows pointing at demo rows in any
   * way, since audit rows cannot be updated), audit and gateway-lookup rows that name a demo row,
   * and the order/refund/purchase order a demo line belongs to.
   * Returns Map table -> Set(key).
   */
  async closure(seed) {
    const { fks, pk } = await this.schema();
    const all = new Map();
    let frontier = new Map();
    const add = (t, key, into) => {
      if (!all.has(t)) all.set(t, new Set());
      const s = all.get(t);
      if (s.has(key)) return;
      s.add(key);
      if (!into.has(t)) into.set(t, new Set());
      into.get(t).add(key);
    };
    for (const [t, keys] of seed) for (const k of keys) add(t, k, frontier);
    const keyExpr = (t) => {
      const cols = pk.get(t) || ["id"];
      return cols.length === 1 ? `${ident(cols[0])}::text` : `json_build_array(${cols.map((c) => `${ident(c)}::text`).join(", ")})::text`;
    };
    let rounds = 0;
    while (frontier.size) {
      rounds += 1;
      const next = new Map();
      // One round trip per round: every foreign key whose parent table has new rows, the soft
      // references and the owners of new lines, in one UNION ALL.
      const params = [];
      const param = (list) => {
        params.push(list);
        return `$${params.length}::text[]`;
      };
      const paramOf = new Map();
      const idsOf = (t) => {
        if (!paramOf.has(t)) paramOf.set(t, param([...frontier.get(t)]));
        return paramOf.get(t);
      };
      const parts = [];
      for (const fk of fks) {
        if (!frontier.has(fk.parent) || fk.pcol !== "id") continue;
        const follow = fk.ondelete !== "n" && fk.ondelete !== "d" ? true : fk.child === "AuditLog";
        if (!follow || fk.child === "DemoRecord") continue;
        parts.push(`SELECT '${fk.child}'::text AS t, ${keyExpr(fk.child)} AS k FROM ${ident(fk.child)} WHERE ${ident(fk.col)} = ANY(${idsOf(fk.parent)})`);
      }
      // Soft references (no foreign key): audit rows and gateway lookups name their record by id.
      const newIds = [];
      for (const [t, keys] of frontier) if ((pk.get(t) || ["id"]).length === 1 && t !== "AuditLog") newIds.push(...keys);
      if (newIds.length) {
        const p = param(newIds);
        parts.push(`SELECT 'AuditLog'::text, id::text FROM "AuditLog" WHERE "entityId" = ANY(${p})`);
        parts.push(`SELECT 'GatewayLookup'::text, id::text FROM "GatewayLookup" WHERE "parentId" = ANY(${p})`);
      }
      // A demo line makes its whole order / refund / purchase order demo.
      for (const [t, [col, owner]] of Object.entries(OWNED_BY)) {
        if (!frontier.has(t)) continue;
        const cols = pk.get(t) || ["id"];
        if (cols.length === 1) {
          parts.push(`SELECT DISTINCT '${owner}'::text, ${ident(col)}::text FROM ${ident(t)} WHERE id = ANY(${idsOf(t)}) AND ${ident(col)} IS NOT NULL`);
        } else {
          for (const k of frontier.get(t)) {
            const o = JSON.parse(k)[cols.indexOf(col)];
            if (o) add(owner, o, next);
          }
        }
      }
      if (parts.length) {
        for (const r of await this.q(parts.join("\nUNION ALL\n"), ...params)) add(r.t, r.k, next);
      }
      frontier = next;
      if (rounds > 50) throw new Error("demo closure did not settle");
    }
    return all;
  }

  async auditTrigger() {
    const rows = await this.q(`SELECT tgname FROM pg_trigger WHERE tgrelid = '"AuditLog"'::regclass AND NOT tgisinternal AND tgenabled <> 'D'`);
    return rows[0]?.tgname || null;
  }

  // ---------------------------------------------------------------- delete

  /** Child-before-parent order of the tables in `set` (by foreign keys among them). */
  async deleteOrder(set) {
    const { fks } = await this.schema();
    const tables = [...set.keys()];
    const deps = new Map(tables.map((t) => [t, new Set()])); // t -> tables that must go first (children)
    for (const fk of fks) {
      if (fk.child === fk.parent) continue;
      if (deps.has(fk.parent) && deps.has(fk.child)) deps.get(fk.parent).add(fk.child);
    }
    const out = [];
    const state = new Map();
    const visit = (t, path) => {
      if (state.get(t) === 2) return;
      if (state.get(t) === 1) throw new Error(`foreign-key cycle among demo tables: ${[...path, t].join(" -> ")}`);
      state.set(t, 1);
      for (const c of deps.get(t)) visit(c, [...path, t]);
      state.set(t, 2);
      out.push(t);
    };
    for (const t of tables) visit(t, []);
    return out;
  }

  /**
   * Deletes the rows in `set` in one transaction, then their DemoRecord rows (and the loader state
   * row when `dropState`). `beforeDelete(tx)` runs first inside the transaction.
   */
  async deleteAll(set, { beforeDelete, dropState = true } = {}) {
    const { pk } = await this.schema();
    const order = await this.deleteOrder(set);
    const auditTrigger = await this.auditTrigger();
    const counts = {};
    await this.db.$transaction(async (tx) => {
      if (beforeDelete) await beforeDelete(tx);
      for (const t of order) {
        const keys = [...set.get(t)];
        const cols = pk.get(t) || ["id"];
        let n = 0;
        if (t === "AuditLog" && auditTrigger) await tx.$executeRawUnsafe(`ALTER TABLE "AuditLog" DISABLE TRIGGER ${ident(auditTrigger)}`);
        for (let i = 0; i < keys.length; i += 5000) {
          const part = keys.slice(i, i + 5000);
          if (cols.length === 1) {
            n += await tx.$executeRawUnsafe(`DELETE FROM ${ident(t)} WHERE ${ident(cols[0])}::text = ANY($1::text[])`, part);
          } else {
            const parsed = part.map((k) => JSON.parse(k));
            const arrays = cols.map((_, j) => parsed.map((p) => p[j]));
            const tuple = cols.map((c) => `${ident(c)}::text`).join(", ");
            const un = cols.map((_, j) => `$${j + 1}::text[]`).join(", ");
            n += await tx.$executeRawUnsafe(`DELETE FROM ${ident(t)} WHERE (${tuple}) IN (SELECT * FROM unnest(${un}))`, ...arrays);
          }
        }
        if (t === "AuditLog" && auditTrigger) await tx.$executeRawUnsafe(`ALTER TABLE "AuditLog" ENABLE TRIGGER ${ident(auditTrigger)}`);
        counts[t] = n;
      }
      await tx.$executeRawUnsafe(`DELETE FROM "DemoRecord" WHERE "entityType" <> $1`, LOAD);
      if (dropState) await tx.$executeRawUnsafe(`DELETE FROM "DemoRecord" WHERE "entityType" = $1`, LOAD);
    }, { maxWait: 30000, timeout: 10 * 60 * 1000 });
    return counts;
  }
}

export function countByTable(set) {
  const out = {};
  for (const [t, keys] of [...set.entries()].sort((a, b) => a[0].localeCompare(b[0]))) out[t] = keys.size;
  return out;
}
