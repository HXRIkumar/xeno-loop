# NEEDS_HUMAN — items requiring you (login, dashboard, or network)

Anything here blocked the autonomous run. I logged it and continued with other work.

> **UPDATE 2026-06-12 — both items below are RESOLVED.** (1) Switched off the blocking Wi-Fi
> onto a phone hotspot, which allows outbound 5432/6543; the Supabase schema is migrated + seeded
> (verified: 200 customers / 880 orders, queried live over the hotspot). (2) Switched the live LLM
> provider to **Groq** (free, fast, OpenAI-compatible) — no more quota wall. Details inline.

---

## 1. This network blocks outbound Postgres ports (6543 / 5432) → can't reach Supabase DB from here

**Status:** ✅ RESOLVED (2026-06-12) — connected via a phone hotspot; Supabase migrated + seeded.
Originally BLOCKED on the build network · worked around with a local Postgres for verification.

**Resolution (2026-06-12):** on a phone hotspot, `aws-1-ap-south-1.pooler.supabase.com:5432` and
`:6543` are reachable. Ran `prisma migrate deploy` + `prisma db seed` against Supabase; a live
read confirms **200 customers / 880 orders** in the Supabase project. Local Docker Postgres (5433)
remains the convenient offline verification DB; flip targets by toggling root `.env.local`.

**Evidence (gathered 2026-06-10):**
- Supabase project is alive: `https://mkhevswlifzasrhsnojt.supabase.co/rest/v1/` returns HTTP 401 over 443 (expected — auth required). DNS for the pooler resolves to AWS IPs.
- TCP connect to `aws-1-ap-south-1.pooler.supabase.com:6543` and `:5432` **times out**, even with the sandbox disabled. HTTPS (443) works fine.
- Conclusion: the local network (firewall/WiFi) drops outbound 5432/6543. Not a credential problem, not the sandbox. Common on corporate/café networks that only allow 80/443.

**What I did instead:** stood up a local Postgres 15 in Docker on port **5433** (container `xeno-loop-pg`, db `loop`). All Prisma migrations, the seed, the reducer/attribution unit tests, and the full send→receipt pipeline are verified against it. The schema and migrations are byte-identical to what Supabase needs — they will apply cleanly there.

**What YOU need to do (morning, on an unblocked network — home WiFi / hotspot / Render):**
1. Confirm the DB password in root `.env` is correct (placeholder was `YOUR_DB_PASSWORD`; you pasted the real one).
2. From a network that allows 5432/6543, apply the schema to Supabase:
   ```bash
   cd apps/crm
   # uses .env (Supabase URLs), NOT .env.local
   npx dotenv -e .env -- prisma migrate deploy
   npx dotenv -e .env -- prisma db seed
   ```
   (Or just delete root `.env.local` so the default scripts target Supabase.)
3. In the Supabase dashboard → Database → Replication, enable Realtime on the `Communication` and `Campaign` tables (needed for the live funnel in prod). Polling fallback already works without this.

---

## 2. Gemini API key has no quota → live agent calls 429

**Status:** ✅ RESOLVED (2026-06-12) — live provider switched to **Groq** (free, OpenAI-compatible);
no billing needed. Originally BLOCKED on Gemini billing.

**Resolution (2026-06-12):** Groq's API is OpenAI-compatible, so the existing OpenAI adapter is now
the live one, pointed at `https://api.groq.com/openai/v1` (model `llama-3.3-70b-versatile`, key
`GROQ_API_KEY`). `LLM_PROVIDER=groq`. The neutral `LLMProvider` interface and the agent loop are
unchanged — the swap was one env var. Verified live: the smoke test (`scripts/test-llm.ts`) gets a
real tool call back from Groq, and a full `/api/agent` e2e runs the tool loop (analyse_audience →
get_past_performance → propose_campaign) against the seeded DB and returns an explainable proposal.
Gemini stays selectable (`LLM_PROVIDER=gemini`) for the moment its key has
quota; Anthropic remains an honest typed stub. (Original Gemini-quota evidence kept below for the
record.)

**Evidence (2026-06-11):** ran the smoke test (`apps/crm/scripts/test-gemini.ts`). The adapter
built a valid request, called the API, and got back:
`429 RESOURCE_EXHAUSTED — "Your prepayment credits are depleted. Please go to AI Studio ... to
manage your project and billing."` The key **authenticates** (no 401/403) — the Google project
simply has no available credits/quota, and the adapter's 429 backoff retried then surfaced it.

**What this means:** the Gemini adapter is wired correctly (it reaches the API and parses both
success and error shapes). The whole agent — loop, tools, proposal flow, UI — is built and
verified end-to-end against a **mock LLMProvider** (`src/lib/agent/loop.test.ts`). Because the
loop only talks to the neutral interface, it will work against live Gemini with **zero code
changes** the moment the key has quota.

**What YOU need to do:**
1. In Google AI Studio (https://ai.studio/projects) for this key's project, either enable
   billing / add prepay credits, OR ensure the project has free-tier quota for
   `gemini-2.5-flash`. (Free-tier keys usually start `AIzaSy…`; the current key starts `AQ.` —
   if that's an OAuth/short-lived token rather than an API key, generate a standard API key.)
2. Paste the working key into root `.env` as `GEMINI_API_KEY`, then re-run:
   `cd apps/crm && npx dotenv -e .env.local -e .env -- tsx scripts/test-gemini.ts`
   — expect it to print a `analyse_audience` tool call. The Loop chat + dashboard opportunities
   then work live immediately.

Note: the app **degrades gracefully** if the key is still out of quota — the Loop chat shows a
friendly "couldn't reach the model" message instead of crashing, and everything else (campaigns,
funnel, analytics, the manual campaign builder) works fully without the LLM.

---
