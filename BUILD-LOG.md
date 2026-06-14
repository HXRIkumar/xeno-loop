# BUILD-LOG — `feat/showcase-suite`

Handoff log for the showcase suite (BUILD-FEATURES.md). Branch off `dev`; **not merged** — owner reviews on the Vercel preview and merges selectively.

**Operating rules honored:** branch-only (never `main`/`dev`); additive & isolated (no behavior change to the agent loop, channel service, fire path, attribution, reducer, receipts, learnings, or channel recommendation); one feature at a time, each `tsc`/lint/tests green before the next; no secrets (env by name only); existing design system reused; no browser storage.

> **Pre-existing lint baseline (NOT introduced by this branch):** the repo already reports 1 error (`react-hooks/set-state-in-effect` in `src/hooks/use-campaign-funnel.ts`) + 2 unused-var warnings (`src/components/analytics-view.tsx`, `src/lib/agent/opportunities.ts`). Those files are outside this work and in the protected fire-path/agent areas, so I did not touch them. I lint my own changed files in isolation and confirm they're clean per feature.

> **Live-DB note:** all code/types/tests build and pass without Postgres. Items needing the live Supabase data to *verify numbers* are flagged "needs live-DB verification" below for the owner's hotspot session. DB host is masked in any output.

---

## Feature 1 — Dynamic, stateful dashboard opportunities ✅

**What:** replaced the static-feeling dashboard opportunity cards with DB-grounded, **stateful** ones that flip `open → in progress → addressed` once a matching campaign is fired. Mirrors the `learnings.ts` / `learnings-data.ts` split.

**Files added**
- `src/lib/opportunities.ts` — PURE core: `Opportunity`/`OpportunityMetric`/`OpportunityCampaignSignal` types, `computeOpportunities(metrics, campaigns)`, `OPPORTUNITY_WINDOW_DAYS=14`. Maps 5 candidate kinds → title/description/metrics/prompt; derives status from recent campaigns; sorts open→addressed. Imports only `inr` (no DB) → unit-testable.
- `src/lib/opportunities-data.ts` — DB loader `getOpportunities()`. Reuses `previewSegment()` (does NOT fork it) for the 5 segment metrics + queries the `Campaign` table for recent acted-on campaigns; parses each campaign's targeted personas via `SegmentFilterSchema`. Thresholds: `DORMANT_MIN_LTV=10000`, `DISCOUNT_INACTIVE_DAYS=45`, `LOYAL_MIN_ORDERS=4`.
- `src/app/api/opportunities/route.ts` — `GET` → `getOpportunities()` (force-dynamic, nodejs).
- `src/lib/opportunities.test.ts` — 6 tests: count>0 filtering + real-number formatting, open→in_progress→addressed transitions, COMPLETED-beats-SENDING, ignores PROPOSED/FAILED/out-of-window/wrong-persona, sort order, empty input.

**Files changed**
- `src/app/page.tsx` — repointed the opportunities import from `@/lib/agent/opportunities` to the new `@/lib/opportunities-data`; render now shows `segmentLabel`, `metricPrimary · metricSecondary`, a status badge (In progress / Addressed), and an **"Ask Loop →"** button (open cards only) that deep-links to `/loop?prompt=<suggestedPrompt>`. Addressed cards are de-emphasized. Added an empty state. `getOpportunities()` is wrapped in `.catch(() => [])` so a DB hiccup can't blank the dashboard.

**Isolation note:** the old `src/lib/agent/opportunities.ts` (in the protected `lib/agent/*`) is **left untouched** — it's simply no longer imported by the dashboard. Not deleted, to keep `lib/agent/*` behavior-identical. It's now dead-as-imported; owner may remove it post-merge if desired.

**Status-derivation rule (documented):** a campaign "acts on" an opportunity only if it's within 14 days, is not `PROPOSED`/`FAILED`, and its `segmentSnapshotJson.personas` includes the opportunity's persona. `COMPLETED` → addressed; `APPROVED`/`SENDING` → in progress; else open.

**Verify on preview**
- Cards show real numbers; counts/₹ match `/customers` + `/analytics` for the same segments. *(needs live-DB verification — confirm the exact counts against production.)*
- Fire a campaign for a segment (e.g. dormant) → reload `/` → that card flips to **In progress**, then **Addressed** after it completes.
- "Ask Loop →" on an open card deep-links to `/loop?prompt=…` and prefills the agent (ties into Feature 2.3).
- No opportunities → friendly empty state, no crash.

**Green:** `tsc` clean · 54/54 tests pass (+6) · Feature-1 files lint-clean.
