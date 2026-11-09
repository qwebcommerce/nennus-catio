# Nennus Catio

Pet store website + POS, forked from the ICODO POS platform.

**Public site (this phase):** single-page marketing site — hero, categories, products, services, contact — with static data and the Nennus Catio palette (`#f6f2e9` cream, `#1e3e2f` forest, `#9cb29a` sage).

**POS:** still in the codebase; product catalog + POS tab customization comes next when you ask.

## Quick start

```bash
cd system
npm run install:all
npm run dev
```

Open **http://localhost:5173**

- Website: `/`
- Staff login: `/login`

One-port mode:

```bash
cd system
npm start
```

→ **http://localhost:4000**

## Stack

| Layer | Tech |
|-------|------|
| Website + POS UI | React 18, Vite, PWA |
| API | Express, Prisma, JWT |
| Database | PostgreSQL (Supabase) |

App code lives in [`system/`](system/).
