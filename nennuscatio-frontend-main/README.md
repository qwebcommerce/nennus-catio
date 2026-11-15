# Nennus Catio website

The Nennus Catio website: the shop, grooming, Pet Houses and Relocation pages and the staff area, in English and Arabic.

Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, next-intl, TanStack Query and Zod. `packages/contracts` holds the data shapes the website checks every API answer against. Biome lints and Vitest tests.

## Run it

You need Node 24.12 and pnpm 11 (`corepack enable` installs the pinned pnpm).

    pnpm install
    pnpm dev

Then open http://127.0.0.1:3000/en (Arabic: /ar; staff area: /en/admin).

`pnpm dev` runs in demo mode with sample data (`apps/web/.env.development`). The staff area opens without signing in and has a role switcher. Customer sign-in, the account pages and parts of the staff area need the API, which is not part of this repository.

## Checks

`pnpm check` runs the lint, type check, tests and production build, as CI does on every push and pull request.
