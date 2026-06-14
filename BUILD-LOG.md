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

---

## Feature 2 — First-load showcase + guided tour + discovery hooks ✅

**What:** the dashboard now announces that Loop is an AI product and actively drives discovery of the agent and the Content Studio, with a replayable guided tour and chip-driven prefill on `/loop`.

**Files added**
- `src/components/capability-hero.tsx` — **2.1** dismissible first-load hero ("Loop — your AI marketing co-pilot") + 3 capability tiles that link to `/loop`, `/campaigns`, and `/campaigns/new#content-studio` (the Content Studio section). Dismiss is React state only (no storage); when dismissed it collapses to a slim bar that still offers the tour. Hosts the tour state.
- `src/components/guided-tour.tsx` — **2.2** self-built 5-step stepper on the existing `Dialog` (no tour library). Steps mirror propose → approve → execute → attribute → learn, each with a deep link. Back/Next/Done + step dots; `motion-reduce` guards respect reduced motion.

**Files changed**
- `src/app/page.tsx` — renders `<CapabilityHero />` at the top of the dashboard.
- `src/components/chat-panel.tsx` — **2.3**: `?prompt=` (via `initialPrompt`) now **prefills** the input and focuses it (was auto-send); starter chips updated to the spec's examples and now **prefill** the input on click (no manual typing). The agent loop itself (`lib/agent/*`) is untouched — only this presentational component changed.

**Decisions (documented)**
- **Tour is button-triggered, not auto-popped.** "Once per session" tracking would need browser storage (forbidden by the rules), and a modal on every reload would violate "never blocking." So the hero is the always-present first-load announcement, and the tour opens from the hero's "Take the tour" / the collapsed bar's "How it works" buttons — visible and replayable, never intrusive.
- **`?prompt=` prefills (not auto-sends)** per spec 2.3 — the marketer reviews the prefilled prompt and hits send. This is a UX change to `chat-panel`, not to the agent.
- **Feature 2.4 (the `/campaigns/new` "Generate creative in the Content Studio" nudge)** is delivered together with Feature 3, since it lives in the same builder file as the Studio section — avoids editing `campaigns/new` twice and keeps the nudge adjacent to its target. The dashboard-side discovery (the Content Studio hero tile) ships here in Feature 2.

**No new pure logic → no new unit tests** for Feature 2 (it's presentational); all 54 existing tests stay green.

**Verify on preview**
- First load: hero communicates what Loop is; 3 tiles link correctly (the Studio tile lands on the builder's Studio section once Feature 3 is in).
- "Take the tour" / "How it works" opens the 5-step modal; Back/Next/Done work; deep links navigate and close it; dismissing the hero leaves the slim "How it works" bar.
- `/loop?prompt=…` prefills + focuses the input (no auto-send); starter chips prefill on click.
- Responsive at 390 / 768 / 1280; reduced-motion respected; nothing blocks normal use.

**Green:** `tsc` clean · 54/54 tests pass · Feature-2 files lint-clean.

---

## Feature 3 — AI Content Studio ✅

**What:** chip-driven, on-brand creative generation behind a provider interface (mirrors `lib/llm`). Surfaced inside the campaign builder **and** as a standalone `/studio` page + a dashboard hero tile, so it's discovered. Images come from a curated, honestly-labelled library; missing files degrade to a placeholder.

**Files added**
- `src/lib/content-studio/types.ts` — `CreativeBrief`, `GeneratedCreative`, `ImageProvider` interface (per spec; `CreativeBrief` adds an optional `nonce` for "Show another" rotation / model seed — documented superset).
- `src/lib/content-studio/library.ts` — `CREATIVE_LIBRARY` manifest + **pure** matcher (`scoreCreative`, `rankCreatives`, `selectCreative`): theme(4) → persona(2) → channel(1), deterministic generic fallback + nonce rotation. No DB/fs → unit-testable.
- `src/lib/content-studio/library-provider.ts` — `LibraryImageProvider` (LIVE) → returns `source:"library"`, caption, altText, promptUsed.
- `src/lib/content-studio/model-provider.ts` — `ModelImageProvider` stub that throws `"image model not configured"` (mirrors the Anthropic LLM stub).
- `src/lib/content-studio/index.ts` — `getImageProvider()` selected by `IMAGE_PROVIDER` env (default `library`), cached like `getProvider()`.
- `src/lib/content-studio/library.test.ts` — 6 tests: exact match, persona/channel fallback, channel-only, rotation, generic fallback, score weighting.
- `src/app/api/studio/generate/route.ts` — `POST` (zod-validated brief) → `getImageProvider().generate()`; 503 + honest message if a provider stub throws.
- `src/components/content-studio.tsx` — the chip-driven panel (`ContentStudio`) + reusable `CreativeThumb` (onError placeholder). Audience + Channel chips (single-select, no typing), Generate, output card with caption + **honest badge** + Show another + Use this + visual-only thumbs.
- `src/app/studio/page.tsx` — standalone `/studio` (no `onUse` → no "Use this").

**Files changed**
- `src/app/campaigns/new/page.tsx` — **3.4**: Content Studio section under the message field (anchor `id="content-studio"`) with the nudge "Add on-brand creative — let Loop generate it." Chips pre-select from the builder's channel + single persona. "Use this" sets a `creative` state shown in the live preview via `CreativeThumb`.
- `src/components/capability-hero.tsx` — Content Studio hero tile now links to `/studio`.
- `src/components/sidebar.tsx` — added a **Studio** nav item; added `LogoMark` (renders `/loop-logo.svg`, falls back to the ∞ text mark) in the desktop/drawer brand + mobile top bar.
- `README.md` / `AI-WORKFLOW.md` — **3.6** one-line honesty note: images are a curated on-brand library; a real model swaps in behind `ImageProvider`.

**Decisions (documented)**
- **"Use this" is presentation-only.** `createCampaign` / `/api/campaigns` don't accept an image, and the spec forbids a risky migration. The chosen creative is held in builder state and shown in the preview, but **not persisted** on the campaign. *Follow-up (optional):* add a nullable `Campaign.creativeJson` (imageUrl + caption + source) column + thread it through `createCampaign` and the campaign detail view. Not done here to keep the working pipeline untouched.
- **`CreativeBrief.nonce`** added as an optional field for rotation — keeps the single `generate(brief)` interface uniform and is a valid model seed later.

### ⚠️ Assets the owner must supply (drop in, no code change needed)
**Images → `apps/crm/public/content-studio/`** (placeholder shows until present; tags must match `library.ts`):

| File | Theme | Persona | Channels |
|---|---|---|---|
| `winback-vip-01.png` | winback | DORMANT | WhatsApp, RCS |
| `highspender-01.png` | loyalty | HIGH_SPENDER | RCS, WhatsApp |
| `new-2nd-purchase-01.png` | new | NEW | WhatsApp, Email |
| `festive-01.png` | festive | (any) | WhatsApp, RCS, Email |
| `discount-01.png` | discount | DISCOUNT_HUNTER | SMS, WhatsApp |
| `dormant-rcs-01.png` | winback | DORMANT | RCS |

(Also listed in `apps/crm/public/content-studio/README.md`. Suggested ~1024px, 4:3 or square, PNG.)

**Logo → `apps/crm/public/loop-logo.svg`** (or `.png` — update the `src` in `sidebar.tsx`'s `LogoMark` if not SVG). Until present, the sidebar shows the ∞ text mark.

**Verify on preview**
- `/campaigns/new`: Content Studio section is visible + inviting; chips pre-select from the chosen channel/persona; Generate shows on-brand creative (or placeholder until PNGs land); "Show another" rotates; honest badge present; "Use this" attaches it to the live preview.
- Standalone `/studio` works (from the dashboard tile + sidebar **Studio**).
- Missing image files → tasteful placeholder, never a broken image; responsive at 390 / 768 / 1280.
- `ImageProvider` interface + library provider + model stub exist and are typed; `IMAGE_PROVIDER=model` returns the honest 503.

**Green:** `tsc` clean · 60/60 tests pass (+6) · Feature-3 files lint-clean (project lint baseline unchanged: 1 pre-existing error + 2 pre-existing warnings, all in untouched files).

---

## Logo (all features)
Sidebar/header renders `apps/crm/public/loop-logo.svg` with a ∞ text fallback (`sidebar.tsx` → `LogoMark`). Drop the file in; no code change needed (use `.svg`, or change the extension in `LogoMark` for `.png`).

## Branch / merge
On `feat/showcase-suite` (off `dev`). **Not merged** — `main`/`dev` untouched. Pushed for a Vercel preview. Owner reviews and merges selectively. The spec file `BUILD-FEATURES.md` and prior root docs (`BUILD-PLAN-*`, `PROJECT-REPORT.md`, `campaigns-backup-*.json`) are intentionally left untracked.
