# Deploying Loop

Two services:

- **Channel service** (`apps/channel-service`) → **Render** web service (persistent Node + Express; needs a long-running queue/worker, which serverless can't host).
- **CRM** (`apps/crm`) → **Vercel** (Next.js App Router + API routes).

DB is **Supabase Postgres** (already migrated + seeded — 200 customers / 880 orders). LLM is **OpenAI** (`gpt-4.1-mini`).

> **No secrets are in this repo.** Every value below is set in the Render/Vercel dashboards. Only `.env.example` is committed.

---

## The circular wiring (read this first)

The two services reference each other's URLs, so neither URL exists until its service is deployed:

- CRM (Vercel) needs **`CHANNEL_SERVICE_URL`** = the Render service URL (to POST sends).
- Channel service (Render) needs **`CRM_RECEIPTS_URL`** = the Vercel URL + `/api/receipts` (to POST receipts back).

Both can boot with a placeholder, so the order is:

1. **Deploy the channel service to Render** → get its URL (`https://xeno-channel-service.onrender.com`).
2. **Deploy the CRM to Vercel** with `CHANNEL_SERVICE_URL` = that Render URL → get the CRM URL (`https://<crm>.vercel.app`).
3. **Go back to Render**, set `CRM_RECEIPTS_URL` = `https://<crm>.vercel.app/api/receipts`, and redeploy the channel service.

That's the only back-and-forth: deploy channel → deploy CRM (wire forward) → update channel (wire back).

---

## Step 1 — Channel service → Render

A `render.yaml` Blueprint is committed at the repo root. Two ways:

**Option A — Blueprint (uses render.yaml):** Render Dashboard → **New → Blueprint** → connect this GitHub repo → it reads `render.yaml` and creates the service. You'll be prompted to fill the `sync: false` var (`CRM_RECEIPTS_URL`) — leave it as a placeholder for now (e.g. `https://example.com/api/receipts`); you'll fix it in Step 3.

**Option B — Manual Web Service:** New → **Web Service** → connect repo → set:
- **Root Directory:** *(leave blank / repo root — this is a monorepo)*
- **Runtime:** Node
- **Build Command:** `npm ci && npm --workspace apps/channel-service run build`
- **Start Command:** `npm --workspace apps/channel-service run start`
- **Health Check Path:** `/health`
- **Node version:** 20 (set env `NODE_VERSION=20`)
- **Region:** Singapore (closest to Supabase `ap-south-1`)

### Env vars to set in the Render dashboard

| Key | Value | When |
|---|---|---|
| `NODE_VERSION` | `20` | now (in render.yaml) |
| `CRM_RECEIPTS_URL` | `https://<your-crm>.vercel.app/api/receipts` | **AFTER Step 2** (placeholder for now) |
| `RECEIPT_CONCURRENCY` | `10` | now (in render.yaml) |
| `REQUEST_TIMEOUT_MS` | `12000` | now (in render.yaml) |
| `WORKER_CONCURRENCY` | `8` | now (in render.yaml) |

- **Do NOT set `PORT`** — Render injects it; the app reads `process.env.PORT` (`config.ts`).
- After it deploys, confirm `https://<service>.onrender.com/health` returns `{ "status": "ok", ... }`. **Copy the service URL.**

---

## Step 2 — CRM → Vercel

The CRM builds cleanly for Vercel (verified: `next build` → 19 routes, all server-rendered on demand). A `postinstall: "prisma generate"` is committed so Vercel generates the Prisma Client on install (otherwise `next build` fails on a fresh install).

**Vercel project settings:**
- **Import** this GitHub repo (Add New → Project).
- **Root Directory:** `apps/crm` (Vercel auto-detects the npm workspace and installs from the repo root).
- **Framework Preset:** Next.js (auto-detected).
- **Build / Install / Output:** leave as Vercel defaults (`npm install` → triggers the postinstall `prisma generate` → `next build`).
- **Node version:** 20.x or 22.x (Project Settings → Node.js Version).

### Env vars to set in Vercel (Project → Settings → Environment Variables — Production)

| Key | Value | Notes |
|---|---|---|
| `DATABASE_URL` | Supabase **pooled** URL (port 6543) | append `?pgbouncer=true&connection_limit=1` for serverless — one connection per function instance |
| `DIRECT_URL` | Supabase **direct** URL (port 5432) | used only by migrations; harmless at runtime |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<project>.supabase.co` | inlined at build → must be set before the build |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key | inlined at build |
| `LLM_PROVIDER` | `openai` | |
| `OPENAI_API_KEY` | `sk-…` | server-side only (never `NEXT_PUBLIC_`) |
| `OPENAI_MODEL` | `gpt-4.1-mini` | |
| `CHANNEL_SERVICE_URL` | `https://<service>.onrender.com` | **the Render URL from Step 1** (no trailing slash) |

Optional: `NEXT_PUBLIC_REALTIME_ENABLED` = `true` to use Supabase Realtime for the live funnel (also enable Realtime on the `Communication` + `Campaign` tables in the Supabase dashboard). If unset/`false`, the funnel falls back to 3s polling, which works fine.

- Deploy. Note the production URL `https://<crm>.vercel.app`. The agent route (`/api/agent`) is configured with `maxDuration = 60` (within Vercel Hobby's 60s limit).

---

## Step 3 — Wire back + redeploy the channel service

1. In **Render** → the channel service → **Environment** → set `CRM_RECEIPTS_URL` = `https://<crm>.vercel.app/api/receipts` (the real Vercel URL).
2. **Manual Deploy → Deploy latest commit** (or it redeploys automatically on env change).
3. Both are now wired: CRM → `CHANNEL_SERVICE_URL` → Render; Render → `CRM_RECEIPTS_URL` → CRM.

---

## Verify end to end

1. Open `https://<crm>.vercel.app` — Customers + dashboard populated (200 customers).
2. `/loop` → ask the agent to propose a campaign → **Approve** → open the campaign → **Fire**.
3. Watch the funnel populate live (Realtime or polling). On `CONVERTED`, attributed orders + revenue appear; the campaign flips to **COMPLETED**.
4. Check the channel service: `https://<service>.onrender.com/health` → `metrics.eventsDeadLettered` should stay ~0; `/dead-letter` should be empty.

---

## Notes / gotchas

- **Render free tier sleeps** after ~15 min idle → ~50s cold start. The CRM's `sendBatchToChannel` has a 10s timeout, so the **first fire after idle may fail** while the service wakes — hit `/health` once to warm it before a demo, or upgrade off free.
- **Region/latency:** keep Render (Singapore) + Vercel (set Function Region to Mumbai `bom1` or Singapore `sin1`) + Supabase (`ap-south-1`) close together. The receipt pipeline is hardened for high latency (bounded receipt concurrency + a 20s interactive-transaction timeout in `receipts.ts`, env-overridable via `PRISMA_TX_TIMEOUT_MS` / `PRISMA_TX_MAX_WAIT_MS`), but lower latency = faster settle.
- **Serverless connections:** use the **pooled** `DATABASE_URL` (`?pgbouncer=true&connection_limit=1`) on Vercel so many concurrent functions don't exhaust the Supabase pooler.
- **Migrations** are already applied to Supabase. If you change the schema later, run `npm run db:migrate:prod` from your machine (over the VPN) — Vercel does not run migrations.
