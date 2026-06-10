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
