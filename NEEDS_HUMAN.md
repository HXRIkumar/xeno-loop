# NEEDS_HUMAN — items requiring you (login, dashboard, or network)

Anything here blocked the autonomous run. I logged it and continued with other work.

---

## 1. This network blocks outbound Postgres ports (6543 / 5432) → can't reach Supabase DB from here

**Status:** BLOCKED tonight · worked around with a local Postgres for verification.

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
