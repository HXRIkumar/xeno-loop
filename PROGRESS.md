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

## Phase 3 — Campaigns + fire + LIVE funnel ✅

**Built**
- **Segment model** (`lib/segment.ts`): a `SegmentFilter` (personas, recency days, LTV bounds,
  frequency, preferred channel) → Prisma where-clause. `previewSegment()` returns count + stats +
  sample; `describeFilter()` gives a human label. Shared by the manual builder AND the agent's
  audience tool. `POST /api/segments/preview`.
- **Campaign lifecycle** (`lib/campaigns.ts`): `createCampaign` (→ PROPOSED, audience size frozen),
  `approveCampaign` (PROPOSED→APPROVED guard), `fireCampaign` (APPROVED-only: resolve audience
  fresh, render per-customer messages, persist QUEUED comms + flip to SENDING in one tx, then hand
  the batch to the channel service). Routes: `POST /api/campaigns`, `/[id]/approve`, `/[id]/fire`.
- **Live funnel**: `GET /api/campaigns/[id]/funnel` (cumulative stage counts + rates + attributed
  revenue). `useCampaignFunnel` hook = **Supabase Realtime primary, 3s polling fallback** behind
  `NEXT_PUBLIC_REALTIME_ENABLED`; stops when the campaign is terminal. Funnel UI with a live-mode
  pill, animated bars, attributed revenue/orders.
- **UI**: `/campaigns` list, `/campaigns/new` manual builder (filter → audience preview → message
  template), `/campaigns/[id]` detail (proposal view pre-fire incl. agent reasoning slot; live
  funnel post-fire) with Approve/Fire actions (human-in-the-loop).

**Verified end to end**
- preview (34 dormant ≥₹10k) → create (PROPOSED) → fire-before-approve **409** → approve → fire
  (34 sent, SENDING). Funnel polled live: sent 0→17→31→36→38→40, delivered tracking behind,
  auto-flips to **COMPLETED**; attributed revenue appeared. All UI pages render 200.

**Key decisions**
- **Audience re-resolved at fire time** from the stored filter (not a frozen customer list) — the
  campaign targets the segment, so late-qualifying customers are included; `audienceSize` is just
  the snapshot estimate.
- **Realtime as a "refetch" signal**, not the data source: the authoritative funnel always comes
  from the REST aggregate; Realtime/polling just decide *when* to refetch. Robust + identical UI
  in both modes. (Local runs poll because local-PG changes aren't visible to Supabase Realtime.)
- **Fire creates rows + flips status in a transaction before dispatching** — a channel hiccup can
  never leave a SENDING campaign with no communications.

**Defend in interview**
1. `lib/campaigns.ts#fireCampaign` — the APPROVED guard, the transaction, and the BullMQ/SQS note.
2. `hooks/use-campaign-funnel.ts` — Realtime-primary / polling-fallback and why REST stays the
   source of truth.
3. `lib/segment.ts` — one filter language shared by the manual UI and the agent.

---

## Phase 4 — Attribution + analytics + insights ✅

**Built**
- **`lib/funnel-math.ts`** — pure `cumulativeFunnel` + `funnelRates` + `rate`, extracted so the
  math is unit-tested independently and shared by the campaign funnel AND analytics (DRY). Refactored
  `lib/funnel.ts` to use it.
- **`lib/analytics.ts`** — rollups: `channelPerformance` (per-channel funnel + attributed revenue),
  `overallFunnel`, `personaDistribution`, `revenueSplit` (attributed vs organic), `revenueByMonth`
  (12-mo time series), `campaignPerformance`, and `getInsights()` bundling them + a plain-language
  `headline` for the agent.
- **`/analytics`** (Recharts): channel-performance combo chart (convert-rate line + attributed-revenue
  bars), overall funnel bar, persona distribution, revenue-over-time line, a precise channel table,
  and revenue-split KPI cards.
- **`GET /api/insights`** — the same numbers as JSON; the agent's `get_past_performance` reads this.

**Verified**
- Unit tests: `funnel-math` 6/6 (cumulative correctness, monotonicity, NaN-safe rates) → 17 total.
- Live data after a 200-msg stress run across all channels: WhatsApp 4% convert / ₹9.7k, RCS 2% /
  ₹10.8k, SMS·Email lower — **real channel differences**. Analytics page renders all four charts;
  `import type` keeps Prisma out of the client bundle (no boundary error).

**Key decisions**
- **Substituted "revenue over time" for the spec's literal "status over time" line** — with the
  time-compressed sim, an events-over-time line is a spike at "now"; monthly attributed-vs-organic
  revenue is genuinely informative and showcases the learning loop. (Noted as a deliberate choice.)
- **Attribution = sum of Orders whose `attributedCommunicationId` belongs to the campaign/channel**
  — last-touch within the window; organic = everything else. Simple, exact, defensible.
- **Pure math core** so attribution/funnel numbers are testable without a DB and reused everywhere.

**Defend in interview**
1. `lib/funnel-math.ts` + `funnel-math.test.ts` — the tested attribution/funnel math.
2. `lib/analytics.ts#channelPerformance` — how channel differences become real, learnable signal.
3. `/api/insights` — the bridge from analytics to the agent's learning loop.

---

## Phase 5 — The agent "Loop" + provider abstraction (crown jewel) ✅

**Built**
- **Provider abstraction** (`lib/llm/`): neutral `types.ts` (LLMProvider.runTurn, ChatMessage with
  assistant-tool-calls, ToolSpec via JSON Schema), `gemini.ts` **fully implemented** per the
  adapter notes (two roles, system→systemInstruction, functionResponse parts, echo the
  functionCall, args-already-object, schema sanitization, 429 backoff), `anthropic.ts`/`openai.ts`
  **typed stubs that throw "provider not configured"**, `index.ts` `getProvider()` on `LLM_PROVIDER`.
- **Agent loop** (`lib/agent/loop.ts`): provider-agnostic, **dependency-injected** (testable with a
  mock). Runs tools across turns, echoes results back, bounded by `MAX_TURNS=5`, catches tool
  errors and feeds them back, captures the proposed campaign.
- **Tools** (`lib/agent/tools.ts`): `analyse_audience`, `get_past_performance` (reads insights),
  `draft_message` (on-brand copy), `propose_campaign` (persists PROPOSED with reasoning) — each
  Zod-validated before touching the DB.
- **Runner** (`agent.ts`): system prompt (analyse → check performance → propose, never fire),
  history mapping, **AgentRun persistence**, and **graceful degradation** (friendly message if the
  model is unreachable). `POST /api/agent` with `maxDuration=60`.
- **UI**: `/loop` full-page chat + **floating chat widget on every page**; the **explainable
  proposal card** (reasoning + audience data + Approve/Edit) inside the chat; tool-trace chips.
  Dashboard **proactively surfaces 3 opportunities** (computed from data, click → agent proposes).
  `CampaignSummary` (agent wraps up completed campaigns; deterministic fallback).

**Verified**
- **Gemini adapter reaches the live API** — the smoke test built a valid request and got a real
  response; the only blocker is the key's **quota (429 prepayment depleted)** → logged in
  NEEDS_HUMAN. Auth works; it'll run live the moment credits are added (zero code change).
- **Agent loop proven with a mock provider** (`loop.test.ts`, 3/3): multi-turn tool execution,
  result echo, proposal capture, tool-error recovery, MAX_TURNS bound. 20 tests total.
- `/api/agent` degrades gracefully on the quota wall (friendly text, no crash); dashboard
  opportunities + `/loop` + floating widget render; full production build clean (19 routes).

**Key decisions**
- **The neutral interface is the product** — only Gemini is live, the other two are honest stubs.
  The loop never imports a vendor SDK, so swapping is one env var.
- **Dependency-injected loop** → unit-testable without quota; the architecture is provable even
  though the live key is out of credits.
- **Opportunities computed deterministically**, not via an LLM call per dashboard load — fast,
  reliable, and the agent still does the actual reasoning when clicked.
- **Graceful degradation everywhere** the LLM is touched — the whole app (campaigns, funnel,
  analytics, manual builder) works fully without the model; only the chat needs it.
- **Vercel timeout trap**: `maxDuration` + bounded `MAX_TURNS` + adapter timeouts/backoff;
  non-streaming for a bounded tool-use loop (simpler, robust) with a thinking state in the UI.

**Defend in interview**
1. `lib/llm/gemini.ts` + `types.ts` — the neutral contract and the Gemini mapping (the gotchas).
2. `lib/agent/loop.ts` + `loop.test.ts` — the provider-agnostic tool loop, proven with a mock.
3. `components/proposal-card.tsx` + `lib/agent/tools.ts#propose_campaign` — the explainable,
   human-in-the-loop proposal (shows its work; never auto-fires).

---

## Post-build (2026-06-12) — both blockers cleared + live agent hardened on Groq

**Blockers resolved** (see NEEDS_HUMAN.md)
- **DB.** Switched off the blocking Wi-Fi onto a phone hotspot (allows outbound 5432/6543);
  Supabase is migrated + seeded — verified **200 customers / 880 orders** live. Local Docker
  Postgres (5433) stays as the offline verification DB; toggle via root `.env.local`.
- **LLM.** Live provider switched **Gemini → Groq** (free, fast). Groq is OpenAI-compatible, so the
  existing OpenAI adapter became the live one (`lib/llm/openai.ts`, fetch-based, no SDK) pointed at
  `api.groq.com/openai/v1`, model `llama-3.3-70b-versatile`. `getProvider()` gained `groq`; the
  neutral interface and the agent loop were untouched — a one-env-var swap. Gemini stays selectable;
  Anthropic stays a typed stub.

**Live e2e of `/api/agent` + Loop (against seeded DB + live Groq) — what it proved AND fixed**
- ✅ Full tool loop runs end to end: model → `analyse_audience` → `get_past_performance` →
  `draft_message` → `propose_campaign`, each executed against the seeded DB with results fed back,
  then a final reply + a persisted PROPOSED campaign. **5/5 runs** clean after the fixes below.
- ✅ Approve path (the proposal card's button → `POST /api/campaigns/[id]/approve`) flips
  PROPOSED→APPROVED. Dashboard opportunities server-render (all three cards present in HTML).
- 🐛→✅ **Bug 1 — invented numbers / wrong channel.** llama batched all tool calls in ONE turn, so
  `propose_campaign` ran before seeing the data tools' results: it cited fake numbers (avg LTV
  "₹5000" vs real **₹47,757**) and picked WhatsApp (0% convert) over the data-best **RCS** (4%).
  Fix: `parallel_tool_calls:false` in the adapter request → the loop genuinely chains, so proposals
  now cite real numbers and pick the data-supported channel (RCS, every run).
- 🐛→✅ **Bug 2 — transient `tool_use_failed` hard-failed the run.** Groq's llama occasionally emits
  a malformed `<function=…>` call; Groq returns 400 `tool_use_failed`. The adapter only retried
  429s, so a single blip killed the whole agent turn (~2/3 of runs). Fix: treat `tool_use_failed`
  400 as transient and re-sample (same retry path as 429). Reliability went 1/3 → 5/5.
- 🧹 Also fixed a stale graceful-degradation string that still named "the Gemini key is out of
  quota" — now provider-neutral ("it's rate-limited").

**Note:** sequential tool-calling is slower than batched (≈30–46s vs ≈3.5s on Groq's free tier
under load) but stays within the `maxDuration=60` guard + `MAX_TURNS=5` bound — correctness
(grounded, explainable proposals) is worth the latency. tsc + eslint clean; 20/20 unit tests pass.

---
