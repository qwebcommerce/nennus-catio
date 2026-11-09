# Pilot operations guide

Short runbook for Icodo POS pilots (MVP retail / grocery / pharmacy).

## Roles & permissions (defaults)

| Area | Admin | Manager | Cashier |
|------|-------|---------|---------|
| POS / sales history | ✓ | ✓ | ✓ (pos) |
| Reports charts | ✓ | ✓ | — |
| Expenses tab | ✓ | ✓ (expenses) | — |
| Customers | ✓ | ✓ | ✓ |
| Receivables | ✓ | ✓ | — |
| Purchases / transfers / count / returns | ✓ | ✓ | — |
| Cash session | ✓ | ✓ | ✓ |
| Loyalty | ✓ | ✓ | — |
| HR / accounting / automations | ✓ | ✓ | — |
| Users / branches / plan / permissions | ✓ | — | — |

Admins always bypass permission checks. Customize matrices under **Administration → Permissions**.

## Plan branch limit

- Each organization has `plan` (`FREE` / `PREMIUM`) and `maxBranches` (default **3**).
- Creating a branch past the limit returns `403` with code `BRANCH_LIMIT`.
- Platform admins raise the limit via **Platform → Organizations → Record plan purchase**.
- The new limit cannot be lower than the current branch count (`PLAN_LIMIT_TOO_LOW`).
- Tenant admins see usage on **Plan** and **Branches**.

## Daily backup (recommended)

### Option A — Supabase dashboard

1. Open the project → **Database → Backups**.
2. Confirm automatic backups are on (PITR on paid plans if available).
3. Before any risky migrate, take a manual snapshot if the plan allows.

### Option B — `pg_dump` script

From the repo root (requires `DIRECT_URL` or `DATABASE_URL` in `system/server/.env`):

```bash
chmod +x scripts/backup-db.sh
./scripts/backup-db.sh
```

Dumps land in `backups/` (gitignored). Keep at least 7 days of dumps for pilots.

### Restore

```bash
# Example custom-format dump
pg_restore --clean --if-exists --no-owner --dbname="$DIRECT_URL" backups/pos-YYYYMMDD-HHMM.dump
```

Or for plain SQL:

```bash
psql "$DIRECT_URL" -f backups/pos-YYYYMMDD-HHMM.sql
```

After restore, run migrations if the dump is older than current code:

```bash
cd system/server && npx prisma migrate deploy
```

## Pilot support checklist

1. Open **Cash** before cash sales (POS warns if no session).
2. Confirm **offline sync queue** is empty at end of day.
3. For pharmacy/grocery: receive stock **with expiry dates**, then use **Lots** on Products.
4. Reprint invoices from **Sales history**; refunds from the same row when allowed.
5. Escalate plan / branch limit changes to platform admin.

## Platform console language

Platform admin UI is **English only** for now (language toggle hidden). Tenant app remains bilingual (AR/EN).
