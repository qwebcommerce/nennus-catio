# Pilot operations guide

Short runbook for the Nennus Catio pilot (shop till, van, website).

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
| Finance / exports | ✓ | ✓ (finance) | — |
| Users / locations / permissions | ✓ | — | — |

Admins always bypass permission checks. Customize matrices under **Administration → Permissions**.

## Email

- Every email goes into the `EmailOutbox` table first and is sent from there, with retries
  (1, 2, 4 … minutes, up to 8 attempts). A failed send never fails the sale, order or registration.
- Set `RESEND_API_KEY`, `SHOP_FROM_EMAIL`, `APP_PUBLIC_URL` (links in emails) and `CRON_SECRET`.
- Vercel Cron calls `/api/cron/email` every 10 minutes with `Authorization: Bearer $CRON_SECRET`
  (a schedule this frequent needs a Vercel Pro plan; on Hobby use a daily schedule or an external cron).
- Rows with `status = 'FAILED'` gave up; check `lastError`.

## Daily backup (recommended)

### Option A — database provider backups

1. Open the project → **Database → Backups**.
2. Confirm automatic backups are on (PITR on paid plans if available).
3. Before any risky migrate, take a manual snapshot if the plan allows.

### Option B — `pg_dump` script

From the repo root (requires `DIRECT_URL` or `DATABASE_URL` in `system/server/.env`):

```bash
chmod +x scripts/backup-db.sh
./scripts/backup-db.sh
```

Dumps land in `backups/` (gitignored). Keep at least 7 days of dumps.

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

1. Open **Cash** before cash sales on the till and before each van run (POS warns if no session).
2. Close the cash-up at the end of the day (counted cash, card total, difference).
3. Reprint invoices from **Sales history**; refunds from the same row when allowed.
4. Check **Finance** for the day (dates are Qatar days, both ends included) and export what you need.
5. Check open supplier bills by age on **Purchase orders** and record payments (cash or bank).

## Platform console language

Platform admin UI is **English only** for now (language toggle hidden). Tenant app remains bilingual (AR/EN).
