# Loop — AI Marketing Co-Pilot (Xeno Mini CRM)

An AI-native mini CRM for a D2C retail brand: the agent finds a revenue opportunity, **proposes a
full campaign** (audience + message + channel + expected impact) with its reasoning shown, the
marketer **approves**, the system **fires** it through a realistic delivery pipeline, then
**attributes revenue** and learns from past outcomes. Human-in-the-loop by design — nothing fires
unsupervised.

## Architecture

```
Next.js CRM (apps/crm, Vercel)  ──POST /send──▶  Channel service (apps/channel-service, Render)
  · UI + API routes + Prisma                       · 202-accept → in-memory queue → worker
  · agent loop (provider-agnostic LLM)             · channel-aware simulated lifecycle events,
  · attribution + analytics                          emitted OUT OF ORDER over random delays
  ◀──POST /api/receipts (idempotent, reducer)───   · retries + dead-letter
        │
        ▼
  Supabase Postgres
```

- **DB:** Supabase Postgres via Prisma (pooled/pgbouncer URL at runtime, direct URL for migrations).
- **LLM:** provider-agnostic `LLMProvider` interface; **OpenAI (`gpt-4.1-mini`) is the live provider**;
  Groq and Gemini are selectable via `LLM_PROVIDER`; Anthropic is a typed stub. Keys are server-side only.
- **Channels are simulated** (no real messaging provider, per the brief) with channel-differentiated
  outcome probabilities, so channel analytics + the agent's channel choices are meaningful.

See `CLAUDE.md` (design/decisions), `PROGRESS.md` (build log), and `DEPLOY.md` (deployment).

## Local development

```bash
npm install
# DB lives in the repo-root .env (Supabase) / .env.local (local Docker Postgres override)
npm run dev:crm        # Next.js on :3000
npm run dev:channel    # Express channel service on :4000
npm test               # unit tests (reducer, attribution/funnel math, agent loop, trace, segment)
```

## Deployment & known trade-offs

Full steps in `DEPLOY.md` (channel service → Render, CRM → Vercel). Notable, conscious trade-offs:

- **Free-tier channel host cold-starts (~50s).** Render's free web service sleeps after ~15 min idle.
  Firing a campaign calls the channel service, so a fire after idle would hit a cold instance. The
  fire path is hardened for this: it **wakes the service** (`/health` poll) and **retries the batch
  send with backoff** on a generous timeout; communications are created **once** and the campaign is
  marked `SENDING` only **after** the batch is accepted, so a failed dispatch leaves it `APPROVED`
  and **re-firing is safe and idempotent** (it reuses existing rows and dispatches only still-queued
  ones — no double-send, no stuck `SENDING`). Tunable via `CHANNEL_WAKE_MAX_WAIT_MS`,
  `CHANNEL_SEND_TIMEOUT_MS`, `CHANNEL_SEND_RETRIES`.
  **On a paid / always-on channel host this disappears** — the service never sleeps, so dial the
  wait/timeouts down (or to zero retries) and fires are instant.
- **In-memory queue + dead-letter** in the channel service (lost on restart). At scale this would be
  BullMQ/Redis or SQS with a durable DLQ; the worker abstraction maps directly.
- **Last-touch attribution within a 7-day window**, single-marketer (no auth). Deliberate scope cuts.
- **Co-locate regions:** CRM functions are pinned to Mumbai (`vercel.json` `bom1`) next to Supabase
  `ap-south-1`; keep Render in Singapore. Cross-region latency is the main avoidable slowdown.

## Tests

Unit-tested cores: the out-of-order/idempotent reducer, attribution/funnel math, the
provider-agnostic agent loop (mock provider), the activity-trace shaping, and the segment filter.
The delivery pipeline + receipt idempotency are verified end-to-end against running services.
