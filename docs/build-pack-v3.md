# Xeno Mini CRM — Winning Build Pack (v3)

**Product:** **"Loop"** — an AI marketing co-pilot that closes the revenue loop.

**Identity in one line:** *Finds the opportunity → proposes a full campaign (audience + message + channel + expected impact, with its reasoning shown) → you approve → it fires through a realistic delivery pipeline → it attributes revenue → it learns what worked to sharpen the next call.*

**Why this wins:** human-in-the-loop agentic = mature judgment + demo-robust; a genuinely engineered, separate delivery pipeline with live updates = the system-design points they flagged; revenue attribution + a learning loop = Xeno's north star (repeat revenue). The agent *shows its work* before proposing — that hits "AI that helps the marketer think, decide and act."

---

## WHAT CHANGED IN v3 (read this first)

1. **Channels are simulated, never real — and now they MEAN something.** No real WhatsApp/SMS/Email/RCS integration anywhere (the brief forbids it). The four channels stay as *labels* because "which channel?" is a core marketing decision and a key analytics dimension. **Upgrade:** the stub now uses **channel-differentiated outcome probabilities**, so channel-performance differences are real in the data and the agent's learning loop has genuine signal to learn from.
2. **The LLM is now provider-agnostic.** All model calls go through a `LLMProvider` interface with thin adapters for Anthropic / OpenAI / Gemini. Swap with one env var (`LLM_PROVIDER`). The agent loop is identical across providers. Build ONE adapter fully; structure the others as drop-ins (stated as a conscious tradeoff).

---

## ON CHANNELS (settle this so you can defend it)

- **You integrate NOTHING.** The "channel service" is a stub you wrote; it simulates delivery and engagement. The channel field is a label: `WHATSAPP | SMS | EMAIL | RCS`.
- **You keep all four** because the agent's job includes *choosing* the channel, and "performance by channel" is a differentiating insight. Collapsing to one channel would delete both.
- **The stub is channel-aware.** Approximate, defensible defaults (tune as you like):

| Channel | Delivered | Opened (of delivered) | Clicked (of read) | Notes |
|---|---|---|---|---|
| WHATSAPP | 92% | 80% | 30% | high engagement |
| SMS | 97% | 55% | 12% | delivers well, lower depth |
| EMAIL | 88% | 40% | 18% | cheap, lower open |
| RCS | 90% | 70% | 25% | rich, mid |

Because of this, "WhatsApp beat SMS for dormant high-LTV" is *true in your data* — the learning loop isn't theatre. State the probabilities as illustrative assumptions in your README.

---

## STACK (v3)

| Layer | Choice | Why |
|---|---|---|
| Frontend + API | Next.js 14 (App Router) + TS strict + Tailwind + shadcn/ui on **Vercel** | One repo, fast deploy, end-to-end types |
| Database | **Supabase Postgres** | Postgres + Realtime + free tier |
| ORM | Prisma (pooled URL for runtime, direct URL for migrations) | Type-safe; pgbouncer-aware |
| **Live updates** | **Supabase Realtime** on `Communication` / `Campaign` | Funnel updates live on camera |
| Polling fallback | 3s polling, behind a flag | Demo can never break |
| Channel service | Separate **Express + TS**, queue + worker, **channel-aware sim** on **Railway** | Long-running worker; serverless is wrong for it (talking point) |
| **LLM** | **Provider-agnostic adapter** (Anthropic / OpenAI / Gemini), tool use, server-side only | Not coupled to one vendor — swap via `LLM_PROVIDER` |
| Charts | Recharts | Simple, clean |

> **Model strings:** pick each provider's fast-but-capable tool-use model and **verify the current string in that provider's docs before shipping** — they change. Set the active one via env. Keep all keys server-side, never in the browser.

---

## LLM PROVIDER ABSTRACTION (the core of the agnostic design)

A neutral contract the agent loop talks to; adapters translate to each SDK.

```ts
// lib/llm/types.ts
export type ToolSpec = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>; // JSON Schema — common denominator
};
export type ChatMessage =
  | { role: "user" | "assistant"; content: string }
  | { role: "tool"; toolCallId: string; name: string; content: string };
export type ToolCall = { id: string; name: string; args: Record<string, unknown> };
export type LLMTurn = { text: string | null; toolCalls: ToolCall[]; stop: "tool_use" | "end" };

export interface LLMProvider {
  runTurn(input: {
    system: string;
    messages: ChatMessage[];
    tools: ToolSpec[];
  }): Promise<LLMTurn>;
}
```

- **Adapters** (`lib/llm/anthropic.ts`, `openai.ts`, `gemini.ts`) each map this to/from their SDK's function-calling shape: Anthropic `tool_use`/`tool_result` blocks; OpenAI `tools`/`tool_calls`/`role:"tool"`; Gemini `functionDeclarations`/`functionCall`/`functionResponse`.
- **Factory:** `getProvider()` reads `LLM_PROVIDER` and returns the right adapter.
- **The agent loop** (call `runTurn` → if `toolCalls`, execute them, append results as `tool` messages → loop until `stop:"end"` or max turns) is **provider-agnostic** and lives in `lib/agent/loop.ts`.
- **Scope reality:** implement the adapter for the key you actually have fully; leave the other two as typed stubs that throw "not configured." Document this as a deliberate tradeoff — the interface is the point.

---

## TIMELINE

Today **Jun 11** → submit **Jun 14 EOD** (real deadline **Jun 15, 12 PM** — keep a morning of buffer).

- **Day 1:** walking skeleton deployed to Vercel — Supabase wired, schema, seed, customers screen, live URL.
- **Day 2:** channel service (channel-aware sim) + idempotent receipts + reconciling state machine (+ tests). Centerpiece.
- **Day 3:** campaigns + live funnel + attribution + analytics + the agent (provider abstraction + one adapter).
- **Day 4:** polish, stress demo, README + AI-WORKFLOW.md, freeze, record video, submit.

### If you fall behind — cut in THIS order (and say you cut them, on purpose)

1. A/B variants (stretch — fine to never start).
2. Second/third LLM adapters (interface stays; only one provider live).
3. Manual segment-builder UI (the agent is the primary path).
4. Realtime → fall back to 3s polling (already built in).
5. Analytics charts → ship raw numbers in a table.
6. **Never cut:** deployed app, the channel callback loop, attribution, the agent proposing one real campaign end to end.

---

## HOW TO USE THIS PACK

1. Create a **monorepo** (`apps/crm`, `apps/channel-service`). Run **Prompt 0** once in Claude Code — it writes `CLAUDE.md`.
2. Run prompts **1 → 6** in order, one at a time. **Deploy after Phase 1 and keep it deployed.** Test the running app after every phase.
3. After every phase, ask your AI tool: *"Explain the 3 most important files you just wrote and the one decision you'd defend in an interview, 4 sentences each."* Read it. **You'll be quizzed live.**
4. Commit after every working phase. Never commit secrets.

**Submission note:** the form has separate frontend/backend fields. Submit two repos, or the monorepo link in both with a README note. Both fine.

---

## PROMPT 0 — Project context (run once)

```
You are my senior engineering partner building a take-home for Xeno, an AI-native
customer-engagement company for retailers. This is a competition — I need first place, not a
pass. Work in small, reviewable increments and STOP after each phase for me to test. I must
understand and defend every line live, so explain non-obvious decisions briefly. No placeholder
TODOs; ship real code. Write tests where I ask. Never commit secrets; give me .env.example.

Set up a monorepo with apps/crm (Next.js) and apps/channel-service (Express). Then create
CLAUDE.md at the repo root with the content below, and STOP.

# Project: "Loop" — AI Marketing Co-Pilot (Xeno Mini CRM)

## What this is
An AI-native mini CRM that helps a D2C retail brand (StyleArc, a mid-market Indian fashion
label) decide who to talk to, what to say, which channel to use — then reach them and PROVE
revenue impact.

## Product identity (commit, do not drift)
A closed-loop co-pilot. The agent PROPOSES a full campaign (audience + message + channel +
expected impact) AND shows the data behind its reasoning; the marketer APPROVES; the system
EXECUTES via a realistic delivery pipeline; then it ATTRIBUTES revenue and LEARNS from past
outcomes to improve the next recommendation. Human-in-the-loop by design — never blast
customers unsupervised. The agent is the hero; a clean classic UI exists underneath.

## Channels (IMPORTANT)
We integrate NO real messaging provider — explicitly forbidden by the brief. Channels
(WHATSAPP|SMS|EMAIL|RCS) are simulated labels handled by our own stubbed channel service. The
stub uses CHANNEL-DIFFERENTIATED outcome probabilities so channel-performance analytics and the
agent's channel choices are meaningful, not random.

## LLM (provider-agnostic)
All model calls go through an LLMProvider interface (lib/llm) with adapters for Anthropic,
OpenAI, and Gemini. The active provider is chosen by env LLM_PROVIDER. The agent loop is
provider-agnostic. Tools are described with JSON Schema (the common denominator). Keys are
server-side only. Implement the adapter for the key I provide fully; leave the others as typed
stubs that throw "not configured" — the interface is the point (state as a tradeoff).

## Three pillars (depth here, cut elsewhere)
1. Agentic decisioning with an approval guardrail AND explainable proposals.
2. A genuinely engineered, SEPARATE channel/delivery service: queue + worker, channel-aware
   out-of-order async lifecycle events, idempotent receipts, a reconciling state machine,
   retries with exponential backoff, dead-letter handling — provably handles volume.
3. Revenue attribution (last-touch within a window) + a learning loop.

## Consciously NOT building (deliberate tradeoffs)
Auth (single marketer), loyalty/offers modules, fancy manual segment builder, mobile, and full
implementations of all three LLM adapters (only the active one).

## Stack
Next.js 14 App Router + TS (strict) + Tailwind + shadcn/ui (apps/crm) on Vercel. Prisma +
Supabase Postgres (POOLED/pgbouncer URL for runtime, DIRECT url for migrations). Live UI via
Supabase Realtime, 3s polling fallback behind a flag. Channel service = separate Express+TS app
(apps/channel-service) on Railway. LLM via provider adapter (env LLM_PROVIDER), server-side key
only. Charts: Recharts.

## Architecture
CRM (Vercel) -- POST /send --> Channel Service (Railway): 202-accepts, enqueues.
Channel worker emits CHANNEL-AWARE lifecycle events at random delays AND out of order -->
POST /api/receipts on CRM. Receipts is idempotent (dedupe on providerEventId), appends to an
event log, a PURE REDUCER computes status from all events (out-of-order safe). Channel retries
with exponential backoff + dead-letter. On CONVERTED, an attributed Order is created -> revenue
rolled up per campaign/segment/channel. UI subscribes via Supabase Realtime. The agent (via
LLMProvider tool use) reads data, shows reasoning, proposes campaigns, and uses past outcomes
as context.

## Conventions
TS strict. Server logic in lib/, thin API routes. Zod validation on all inputs. Small functions.
Unit-test the reducer and attribution. Conventional commits. .env.example committed, real .env
never.

After creating CLAUDE.md, list the phase plan back to me in one short paragraph and wait for
"Phase 1".
```

---

## PROMPT 1 — Walking skeleton, deployed (Day 1)

```
Phase 1. Goal: a live, deployed app TODAY with data and a customers screen. Follow CLAUDE.md.

1. Scaffold apps/crm: Next.js 14 (App Router, TS strict, Tailwind, src/). Add shadcn/ui.
2. Add Prisma + Supabase Postgres. CRITICAL: DATABASE_URL = POOLED (pgbouncer, port 6543,
   ?pgbouncer=true) for runtime; DIRECT_URL = direct (port 5432) for migrations. datasource db
   { url = env("DATABASE_URL") directUrl = env("DIRECT_URL") }. Give me .env.example and tell me
   exactly where in the Supabase dashboard to copy each.
3. Schema (refine names if cleaner, keep intent):
   - Customer: id, name, email (unique), phone, persona (enum HIGH_SPENDER|DORMANT|NEW|
     DISCOUNT_HUNTER|BRAND_LOYAL), ltv, totalOrders, lastOrderDate (DateTime?),
     preferredChannel (enum WHATSAPP|SMS|EMAIL|RCS), createdAt
   - Order: id, customerId, amount, category, channel (online|offline), createdAt,
     attributedCommunicationId (String?, nullable)
   - Segment: id, name, description, filterJson (Json), createdAt
   - Campaign: id, name, goal, segmentSnapshotJson (Json), audienceSize, messageTemplate,
     channel (enum WHATSAPP|SMS|EMAIL|RCS), expectedImpactJson (Json?), reasoningJson (Json?),
     status (enum PROPOSED|APPROVED|SENDING|COMPLETED|FAILED), createdAt
   - Communication: id, campaignId, customerId, renderedMessage, channel,
     status (enum QUEUED|SENT|DELIVERED|OPENED|READ|CLICKED|CONVERTED|FAILED), createdAt, updatedAt
   - CommunicationEvent: id, communicationId, providerEventId (UNIQUE), type (status enum),
     occurredAt, receivedAt  // APPEND-ONLY; source of truth for idempotency + ordering
   - AgentRun: id, prompt, decisionJson (Json), reasoningJson (Json), provider (String),
     createdAt
4. Seed: 200 realistic StyleArc customers (real-sounding Indian names, valid-looking
   emails/phones), distribution 20% HIGH_SPENDER, 25% DORMANT, 20% NEW, 20% DISCOUNT_HUNTER,
   15% BRAND_LOYAL. Each has 1–8 orders, INR 800–12000, categories (Tops, Denim, Dresses,
   Accessories, Footwear), dates over 12 months. Compute ltv/totalOrders/lastOrderDate from
   orders; persona consistent with the pattern. Give customers a preferredChannel.
5. /customers: clean table (name, persona badge, LTV, orders, last order, preferred channel)
   with persona + search filters; /customers/[id] detail with order history.
6. Dashboard shell + left sidebar (Dashboard | Customers | Campaigns | Analytics | Loop). Only
   Customers works this phase.

Then give EXACT commands to: (a) set up Supabase + paste both URLs, (b) prisma migrate + seed,
(c) run locally, (d) deploy apps/crm to Vercel + which env vars to set there. STOP. I deploy
before you continue.
```

---

## PROMPT 2 — Channel service + receipt loop (Day 2, the centerpiece)

```
Phase 2. System-design centerpiece. Follow CLAUDE.md.

A) apps/channel-service (own package.json, Express + TS):
- POST /send { communicationId, recipient, message, channel } → 202 immediately, enqueue.
- Worker drains the queue. Per item, schedule lifecycle events at RANDOM delays (2–10s), emitted
  possibly OUT OF ORDER. Use CHANNEL-DIFFERENTIATED probabilities (configurable map):
  WHATSAPP delivered 92 / opened 80 / read of opened 70 / clicked of read 30 / converted of
  clicked 12; SMS 97 / 55 / 60 / 12 / 10; EMAIL 88 / 40 / 65 / 18 / 11; RCS 90 / 70 / 68 / 25 /
  12. (Percentages; FAILED if not delivered, terminal.) Keep the map in one config object.
- Each event: unique providerEventId (uuid) + occurredAt. POST to env CRM_RECEIPTS_URL.
- Reliability: on non-2xx/timeout, retry up to 4x exponential backoff (0.5/1/2/4s). After final
  failure push to in-memory dead-letter + log. Expose GET /dead-letter and GET /health.
- Handle BATCH send (campaign of N) with independent per-recipient async timelines.
- POST /stress?count=N fabricates N sends to prove volume handling.
- Structured logging so the demo visibly shows the loop + per-channel behaviour.

B) CRM receipts endpoint POST /api/receipts:
- Zod-validate { communicationId, providerEventId, type, occurredAt }.
- IDEMPOTENT: insert CommunicationEvent unique on providerEventId; if exists, no-op, 200.
- PURE REDUCER in lib/: rank QUEUED<SENT<DELIVERED<OPENED<READ<CLICKED<CONVERTED; FAILED
  terminal unless a later positive event proves delivery. Reducer reads ALL events, derives
  status from max rank, so out-of-order (READ before DELIVERED) is naturally correct.
  UNIT TEST with out-of-order + duplicate inputs.
- On CONVERTED: create an Order attributed to that communication (attributedCommunicationId set,
  realistic amount) within a last-touch attribution window; update customer ltv/totalOrders/
  lastOrderDate. Comment the window assumption.

C) Wiring order (circular dep): deploy channel service to Railway FIRST → its public URL becomes
CHANNEL_SERVICE_URL on the CRM; the CRM's deployed URL becomes CRM_RECEIPTS_URL on the channel
service. List both env vars for both sides + deploy commands. STOP after I confirm a test send
produces live status updates end to end.
```

---

## PROMPT 3 — Campaigns + send + LIVE funnel (Day 3 morning)

```
Phase 3. Follow CLAUDE.md.
1. Segmentation: filter model (persona, recencyDays, frequency, min/max LTV, preferredChannel)
   stored as filterJson. POST /api/segments/preview → matching count + sample. Minimal manual
   filter UI; the agent is the primary path later.
2. Campaign create: name, goal, segment, messageTemplate with {name}/{persona}/{offer}, channel.
   Status starts PROPOSED.
3. POST /api/campaigns/[id]/fire (only from APPROVED): render per-customer message, create
   Communication rows (QUEUED), call channel /send per recipient, set campaign SENDING. Batch
   the calls; don't block the request — comment how you'd use BullMQ/SQS at scale.
4. Campaign detail page: live funnel (sent/delivered/opened/read/clicked/converted + rates).
   PRIMARY: Supabase Realtime subscription on Communication changes for this campaign. FALLBACK:
   useRealtimeOrPoll() switches to 3s polling if Realtime isn't connected, behind an env flag.
   When all communications are terminal, mark campaign COMPLETED.
STOP for review.
```

---

## PROMPT 4 — Attribution + analytics (Day 3 midday)

```
Phase 4. Follow CLAUDE.md.
1. Attribution rollups in lib/ (last-touch within window): per campaign, per segment, per
   channel — communications sent, delivery/open/read/click/convert rates, attributed orders
   count, attributed revenue (sum of Orders whose attributedCommunicationId belongs to that
   campaign), attributed vs organic revenue. UNIT TEST the math.
2. /analytics (Recharts): funnel chart, status-over-time line, persona distribution, and a
   CHANNEL-PERFORMANCE comparison (convert rate + attributed revenue by channel) — this should
   now show real differences thanks to the channel-aware sim.
3. GET /api/insights → same numbers as JSON; the agent consumes this for its learning loop.
STOP for review.
```

---

## PROMPT 5 — The agent "Loop" + provider abstraction (Day 3 evening, crown jewel)

```
Phase 5. Build the provider-agnostic agent. Follow CLAUDE.md.

A) Provider abstraction in lib/llm:
- types.ts: LLMProvider interface with runTurn({ system, messages, tools }) -> { text,
  toolCalls, stop }. Neutral ChatMessage/ToolSpec/ToolCall types. Tools described with JSON
  Schema.
- adapters: anthropic.ts, openai.ts, gemini.ts — each translates the neutral shape to/from that
  SDK's function-calling format. Implement the adapter for the key I provide FULLY; the other
  two are typed stubs that throw "provider not configured". 
- index.ts: getProvider() reads env LLM_PROVIDER (anthropic|openai|gemini) and returns the
  adapter; one model-id config per provider (I will set the active key + model).

B) Agent loop in lib/agent/loop.ts (provider-agnostic):
- Calls provider.runTurn; if toolCalls, executes them, appends results as tool messages, loops
  until stop:"end" or MAX_TURNS (~5). Validate every tool input with Zod. Handle multiple
  content blocks. Degrade gracefully if a tool errors.

C) Tools (server-side):
- analyse_audience(filters) -> count + segment stats from DB
- get_past_performance() -> reads /api/insights so it reasons from real outcomes ("WhatsApp
  converted dormant high-LTV 3x better than SMS last time")
- draft_message(persona, goal, tone, offer) -> on-brand StyleArc copy
- propose_campaign(name, goal, segmentFilters, messageTemplate, channel, expectedImpact,
  reasoning) -> persists Campaign as PROPOSED with reasoningJson, returns it for review

D) Vercel timeout trap: agent route export const maxDuration; bounded loop; stream where
sensible. Tell me how you handled it.

E) Human-in-the-loop: the agent PROPOSES, never auto-fires. Marketer approves in UI
(PROPOSED -> APPROVED), enabling the existing fire endpoint. After a campaign completes, the
agent summarises results in natural language and stores it in AgentRun (with provider name).

F) UI: a "Loop" chat page + floating chat button everywhere. Render a proposed campaign as an
APPROVE/EDIT CARD inside the chat that ALSO shows the agent's reasoning and the audience data it
pulled (explainable proposal — core, not optional). On dashboard load, the agent proactively
surfaces 2–3 opportunities computed from the data.

STOP and explain how the provider abstraction + tool loop work so I can defend both.
```

---

## PROMPT 6 — Polish, README, AI-workflow log (Day 4)

```
Phase 6. Follow CLAUDE.md.
1. UI polish: consistent spacing, empty/loading/error states, an intentional non-generic look
   (deliberate type + colour). Add a visible "Stress test" control on the dashboard that calls
   channel /stress and shows the pipeline absorbing 1,000+ communications — volume proof.
2. README.md: what I built + opinionated WHY; architecture diagram of the two-service callback
   loop; the data model; the LLM provider-abstraction design; explicit tradeoffs ("I'd do X at
   scale, did Y here" — at least: no auth, Realtime+polling fallback, in-memory queue vs
   BullMQ/SQS, last-touch attribution simplification, single-region DB, bounded agent loop for
   serverless, one LLM adapter live vs three structured, simulated channel probabilities); how
   to run locally; deploy notes; monorepo/two-link submission note.
3. AI-WORKFLOW.md: how I used my AI coding tool phase-by-phase, decisions accepted vs rejected,
   bugs I caught in AI output, how I directed and reviewed it. (Xeno scores AI-native
   development separately — free points.)
4. Final: both services deployed, env set, fresh end-to-end run works from a clean browser.
   Give me a pre-submission smoke-test checklist.
```

---

## STRETCH (only if ahead on Day 4 — never at the cost of a working demo)

**A/B message variants.** The agent drafts 2 variants, you split a segment 50/50, analytics shows the winner, and the result feeds `get_past_performance`. On-brand with Xeno's "Content Studio" and makes the learning loop tangible. Name it in the README either way.

---

## VIDEO SCRIPT (5–6 min, record Day 4)

- **0:00–0:30 — Problem + bet.** "Most build a CRM that *sends*. I built a co-pilot that *closes the loop* — and proves revenue. Human-in-the-loop on purpose, and not coupled to any one AI vendor."
- **0:30–2:00 — Live demo.** Agent surfaces a win-back opportunity → proposes a campaign *with reasoning shown* → approve → fire → **funnel updates live** → attributed revenue appears.
- **2:00–3:00 — Architecture (system-design minute).** Two-service callback loop: channel-aware out-of-order events, idempotent receipts, the reducing state machine, retries + dead-letter. Hit the **stress button**, show 1,000+ flowing.
- **3:00–4:00 — Code.** Three files: the reducer, the attribution hook, the provider-agnostic agent loop.
- **4:00–5:00 — AI-native workflow.** CLAUDE.md + AI-WORKFLOW.md; how you directed and reviewed your AI tool.
- **5:00–5:30 — Tradeoffs + scale.** What you cut on purpose and what you'd do at volume.

---

## PRE-SUBMISSION CHECKLIST

- [ ] CRM live on Vercel; channel service live on Railway; both reachable from a clean browser
- [ ] Env set BOTH sides: `DATABASE_URL`, `DIRECT_URL`, `LLM_PROVIDER`, the active provider key (`ANTHROPIC_API_KEY`/`OPENAI_API_KEY`/`GEMINI_API_KEY`), `CRM_RECEIPTS_URL`, `CHANNEL_SERVICE_URL`, Supabase keys
- [ ] Seed data present in the deployed DB
- [ ] Realtime works in prod (polling fallback verified)
- [ ] Stress demo works on the deployed app
- [ ] Channel-performance analytics shows real differences
- [ ] GitHub repo(s) readable, **no secrets committed**, `.env.example` present
- [ ] Video uploaded + public + transcript ready
- [ ] You can explain every file you'll be asked about — especially the provider adapter + reducer
- [ ] **Submitted via the FORM** (never email), with buffer before Jun 15, 12 PM
