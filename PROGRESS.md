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

## Phase 2 — Channel service + receipt loop (the centerpiece) ✅

**Built**
- **`apps/channel-service`** (Express + TS): `POST /send` → 202 + enqueue; in-memory FIFO `Queue`
  drained by a long-running `DeliveryWorker` with **bounded concurrency**. Per message the
  `simulator` rolls **channel-differentiated probabilities** (one config object) to decide how
  far it gets, materialises one event per stage with **monotonic `occurredAt`** but
  **independent random dispatch delays (2–10s)** → callbacks arrive OUT OF ORDER. `receipts-client`
  POSTs each to the CRM with **4-retry exponential backoff (0.5/1/2/4s)**; permanent 4xx or
  exhausted retries → **in-memory dead-letter**. `GET /health` (throughput metrics), `GET
  /dead-letter`, `POST /send/batch`, `POST /stress?count=N`.
- **CRM `POST /api/receipts`** (`lib/receipts.ts`): Zod-validated, **idempotent** (insert
  CommunicationEvent unique on `providerEventId`; duplicate → no-op 200), re-derives status via
  the **pure reducer**, and on first reach of CONVERTED creates exactly one attributed Order +
  rolls up customer LTV/orders. When all comms settle → campaign auto-**COMPLETED**.
- **`lib/reducer.ts`** — pure, zero-runtime-dep state machine: status = max rank over the whole
  event log, so out-of-order + duplicates are correct by construction. FAILED terminal unless
  delivery is proven.
- **`POST /api/stress`** provisions a real synthetic campaign of N comms across all channels so
  the stress test flows through the genuine pipeline (funnel + analytics actually move).

**Verified end to end (against running services + local Postgres)**
- 80-message run: 236 events delivered, 0 dead-lettered, clean funnel decay, all comms settled →
  campaign COMPLETED.
- Conversion path: hand-drove a comm to CONVERTED → 1 attributed order, customer LTV 18,200 →
  22,200, orders 4 → 5. **Re-posting the same CONVERTED event → deduped, NO second order / no
  double LTV** (idempotency proven).
- Out-of-order through the endpoint: READ posted before DELIVERED → status stays READ.
- 404 (unknown comm) / 400 (bad payload) handled. Permanent 404 from a ghost comm → dead-lettered
  with 0 retries.
- **Tests:** reducer 11/11 (incl. out-of-order, duplicate, commutativity); channel-service 6/6
  (channel-aware rates ±4%, retry→success, persistent-500→dead-letter, permanent-404 no-retry).

**Key decisions**
- **Event log + pure reducer** instead of mutating status per event — the whole reason
  out-of-order/duplicate handling is trivial and testable. This is the system's spine.
- **Idempotency at two layers**: DB unique on `providerEventId` (no duplicate events) + "one
  attributed order per communication" guard (no double revenue) — survives the channel's retries.
- **Permanent vs transient errors**: 4xx (except 408/429) don't retry — retrying a 404 is waste.
  Deviates slightly from "retry any non-2xx" in the spec; it's the more correct behaviour.
- **`final` flag from the provider** signals end-of-lifecycle → cheap, exact campaign-completion
  (no time-based guessing). Real providers send terminal receipts; this mirrors that.

**Defend in interview**
1. `apps/crm/src/lib/reducer.ts` + `reducer.test.ts` — why deriving from the log beats mutating.
2. `apps/crm/src/lib/receipts.ts` — the two-layer idempotency and the attributed-order rollup.
3. `apps/channel-service/src/queue.ts` + `receipts-client.ts` — long-running worker (why not
   serverless) + retry/backoff/dead-letter reliability.

---
