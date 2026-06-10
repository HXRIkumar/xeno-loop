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
server-side only. **Gemini is the one live adapter** (per docs/gemini-adapter-notes.md);
Anthropic and OpenAI are typed stubs that throw "provider not configured" — the interface is
the point (stated as a deliberate tradeoff).

## Three pillars (depth here, cut elsewhere)
1. Agentic decisioning with an approval guardrail AND explainable proposals.
2. A genuinely engineered, SEPARATE channel/delivery service: queue + worker, channel-aware
   out-of-order async lifecycle events, idempotent receipts, a reconciling state machine,
   retries with exponential backoff, dead-letter handling — provably handles volume.
3. Revenue attribution (last-touch within a window) + a learning loop.

## Consciously NOT building (deliberate tradeoffs)
Auth (single marketer), loyalty/offers modules, fancy manual segment builder, mobile, and full
implementations of all three LLM adapters (only Gemini is live).

## Stack
Next.js (App Router) + TS (strict) + Tailwind + shadcn/ui (apps/crm). Prisma + Supabase Postgres
(POOLED/pgbouncer URL for runtime, DIRECT url for migrations). Live UI via Supabase Realtime, 3s
polling fallback behind a flag. Channel service = separate Express+TS app (apps/channel-service).
LLM via provider adapter (env LLM_PROVIDER), server-side key only. Charts: Recharts.

## Architecture
CRM -- POST /send --> Channel Service: 202-accepts, enqueues.
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

## Local dev / environment notes (this build)
- Monorepo via npm workspaces: `apps/crm` (Next.js) + `apps/channel-service` (Express).
- Secrets live in the repo-root `.env` (the real Supabase + Gemini target). Each app symlinks
  `.env` / `.env.local` from the root so Next.js and Prisma auto-load them.
- `.env.local` (root, gitignored) overrides the DB URLs to a LOCAL Postgres (Docker, port 5433)
  for verification, because this network blocks Supabase's Postgres ports (see NEEDS_HUMAN.md).
  To target Supabase, delete `.env.local` or use the `*:prod` scripts on an unblocked network.
- Deployment is deferred (Render in the morning). The channel service runs on localhost:4000;
  the CRM on localhost:3000. No cloud accounts touched tonight.

## Build phases
0. Monorepo + this file.
1. Walking skeleton: Prisma schema, seed 200 StyleArc customers, /customers screen, dashboard shell.
2. Channel service (channel-aware sim, queue+worker, retries, dead-letter) + idempotent receipts
   + pure reducer state machine (+ unit tests). The system-design centerpiece.
3. Campaigns + segment preview + fire endpoint + LIVE funnel (Realtime, polling fallback).
4. Attribution rollups (last-touch in window) + analytics charts + /api/insights (+ unit tests).
5. The agent "Loop": provider abstraction (Gemini live), tool loop, explainable proposal cards,
   human-in-the-loop approval.
