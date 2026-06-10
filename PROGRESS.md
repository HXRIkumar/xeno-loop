# PROGRESS — Loop (Xeno Mini CRM)

Running log of the autonomous build. One section per phase: what got built, key decisions, and
the 2–3 files/decisions to be ready to defend in an interview.

---

## Phase 0 — Monorepo + CLAUDE.md ✅

**Built**
- npm-workspaces monorepo: root `package.json` with `workspaces: ["apps/*"]` and convenience
  scripts (`dev:crm`, `dev:channel`, `build`, `test`, `db:migrate`, `db:seed`).
- `CLAUDE.md` — the guiding doc (product identity, channels-are-simulated rule, provider-agnostic
  LLM design, three pillars, deliberate non-goals, architecture, conventions).
- Env wiring: root `.env` (real Supabase + Gemini) and `.env.example` (blank). `.gitignore`
  ignores `.env`/`.env.local` and keeps `.env.example` tracked. No secrets committed.

**Key decisions**
- **Local Postgres for verification.** This network blocks Supabase's Postgres ports (6543/5432
  time out; HTTPS works). Stood up an isolated Postgres 15 in Docker on port **5433** (container
  `xeno-loop-pg`) and override the DB URLs via root `.env.local`. The schema/migrations are
  identical to what Supabase needs. Logged the swap-to-Supabase steps in `NEEDS_HUMAN.md`.
  (Did NOT touch the unrelated `ppos-postgres` container already on 5432.)
- **npm workspaces** over Turborepo/pnpm — zero extra tooling, native, one `node_modules` hoist.
- **Next.js version:** scaffolding with the current stable App Router release on Node 24 (see
  Phase 1 notes) rather than pinning 14, for runtime stability. App Router architecture is
  identical — the spec's intent is preserved.

**Defend in interview**
1. `CLAUDE.md` — why channels are simulated-but-meaningful, and why the LLM is provider-agnostic.
2. The env strategy — single source of truth at root, `.env.local` override for local DB, never
   commit secrets.

---

## Phase 1 — Walking skeleton ✅

**Built**
- **Prisma schema** (`apps/crm/prisma/schema.prisma`): Customer, Order, Segment, Campaign,
  Communication, **CommunicationEvent** (append-only, `providerEventId` UNIQUE — the idempotency
  + ordering source of truth), AgentRun + all enums. Datasource uses pooled `DATABASE_URL` +
  `directUrl` for migrations.
- **Seed** (`prisma/seed.ts`): 200 StyleArc customers, deterministic RNG, persona-consistent
  order shapes — verified in-DB: HIGH_SPENDER ~₹52k LTV & recent, DORMANT ~203 days idle (the
  win-back target), NEW tiny & recent, etc. This is what makes segmentation + the learning loop
  real, not theatre.
- **UI**: Next.js 16 App Router + TS strict + Tailwind v4 + a hand-built shadcn-style kit
  (Button/Card/Badge/Table/Select/Dialog/Tabs/…). App shell with sidebar. `/customers` (real
  server-side persona+search filtering via Prisma), `/customers/[id]` (order history),
  dashboard (KPIs + persona distribution). Distinctive violet theme + per-channel hues.

**Key decisions**
- **Next 16 / React 19 / Tailwind v4** (create-next-app@latest), not pinned 14. App Router
  architecture is identical; this is the supported combo on Node 24. shadcn-style primitives are
  hand-owned (no CLI dependency) so they're fully defensible and v4-clean.
- **Prisma pinned to 6** (not the just-released 7) — keeps the conventional
  `import { PrismaClient } from "@prisma/client"` and avoids v7's breaking generator/output
  changes mid-build.
- **Self-hosted `geist` font** instead of `next/font/google` — removes a build-time network
  fetch (this network is flaky on non-443).
- **Money as whole-INR `Int`**; rates computed at read time.

**Defend in interview**
1. `prisma/schema.prisma` — the event-log + derived-status design (CommunicationEvent unique on
   providerEventId) that Phase 2's reducer depends on.
2. `prisma/seed.ts` — persona-consistent data so "WhatsApp beat SMS for dormant high-LTV" can be
   *true in the data*.
3. Server-side filtering in `app/customers/page.tsx` (real Prisma `where`, not client filtering).

---
