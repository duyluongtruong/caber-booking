# Tennis booking assistant — implementation plan

> **For agentic workers:** Use this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. After **Phase 0**, update `src/adapters/clubspark/selectors.ts` (or equivalent) with **real** selectors from your spike — do not guess DOM in production code.

**Goal:** Deliver a local CLI tool that plans multi-account Clubspark bookings, runs Playwright checkout with runtime-only card data, and maintains a **court × time × access code** ledger.

**Architecture:** TypeScript CLI; **plain local config** (gitignored) for Clubspark accounts + group defaults; **ledger** in JSON or SQLite (also local, gitignored); pure **planner** module; **Playwright** adapter; **runner** orchestrates jobs; no cloud, no persisted PAN/CVV.

**Tech stack:** Node.js 20+, TypeScript, Playwright, `commander` (CLI), `better-sqlite3` **or** JSON files for ledger (SQLite optional but nice for queries). **No encryption** for account passwords in v1 — see spec §7.1 hygiene.

---

## File structure (target)

```
tennis-booking/
├── package.json
├── tsconfig.json
├── playwright.config.ts
├── .env.example                 # optional; no secrets — card data never here
├── .gitignore                   # must include config/accounts.local.json, ledger DB
├── README.md
├── config/
│   ├── accounts.example.json    # committed: shape + fake placeholders
│   └── accounts.local.json      # gitignored: real usernames/passwords
├── docs/superpowers/specs/...
├── docs/superpowers/plans/...
├── src/
│   ├── cli.ts                 # entry: subcommands run, ledger, validate-config
│   ├── loadConfig.ts          # merge example defaults + load accounts.local.json
│   ├── planner/
│   │   ├── types.ts
│   │   └── planJobs.ts        # pure: accounts + template → Job[]
│   ├── ledger/
│   │   ├── types.ts
│   │   └── store.ts           # CRUD rows; export CSV/Markdown
│   ├── runner/
│   │   └── runSession.ts      # orchestration, abort policy
│   └── adapters/clubspark/
│       ├── selectors.ts       # ALL UI strings / roles — filled after Phase 0 spike
│       ├── auth.ts
│       ├── bookSlot.ts
│       └── pay.ts
└── tests/
    ├── planner.test.ts
    ├── loadConfig.test.ts       # parse example fixture; reject missing password in strict mode optional
    └── ledger.test.ts
```

---

## Phase 0: Spike on live Clubspark (human + codegen)

**Outcome:** A short internal note (e.g. `docs/superpowers/notes/clubspark-ui-spike.md`) listing verified steps and **selector strategy** (role, text, data-testid). No product code required yet.

- [ ] **Step 1:** `git init` in repo root; add `.gitignore` (`node_modules`, `.env`, `config/accounts.local.json`, `*.db`, `data/`, `playwright-report`, `test-results`).
- [ ] **Step 2:** `npm init -y` and `npm i -D playwright @playwright/test typescript tsx`; `npx playwright install chromium`.
- [ ] **Step 3:** Run `npx playwright codegen "https://play.tennis.com.au/CaberParkTennisCourts/Booking/BookByDate"` — sign in with a **non-production** or **far-future** date if possible; record **exact** clicks to: choose date → pick **one** court → pick **one** 2h slot → reach payment → **stop before submitting real payment** unless using a test card the venue allows.
- [ ] **Step 4:** Note whether **PIN / access code** appears on the confirmation page and **where** in the DOM.
- [ ] **Step 5:** Paste summarized selectors and URL patterns into `docs/superpowers/notes/clubspark-ui-spike.md` and mirror constants into `src/adapters/clubspark/selectors.ts` in Phase 3.

---

## Phase 1: Project scaffold + planner (testable, no browser)

**Subagent parallelization:** Task 2 cannot start until `package.json` + `tsconfig` expose `npm test` (Task 1). For **future** phases, split by **file ownership** (e.g. Phase 2: one agent `loadConfig` + fixtures, another `ledger/types` + empty store) after shared types are merged.

- [x] **Task 1 — TypeScript scaffold**
  - Add `tsconfig.json` (`"strict": true`, `outDir": "dist"`, `rootDir": "src"`).
  - Add `package.json` scripts: `"build": "tsc"`, `"test": "node --test --import tsx"`, `"cli": "tsx src/cli.ts"`.
  - **Commit:** `chore: init ts project`.

- [x] **Task 2 — Planner module**
  - **Create** `src/planner/types.ts`: `BookingAccount`, `TimeWindow`, `PlannedJob` (accountId, courtLabel, start, end, sequence).
  - **Create** `src/planner/planJobs.ts`: function `planJobs(accounts, template) => PlannedJob[]` enforcing **≤2 jobs per account per day** and **≤2h per job**; court count = 3; **template** encodes how 07:30–10:00 splits into bookable blocks (adjust after spike if UI forces a different split).
  - **Create** `tests/planner.test.ts`: assert throws if fewer than 3 courts worth of capacity; assert each account has ≤2 jobs; assert no overlapping jobs for same account.
  - Run: `npm test` — green.
  - **Commit:** `feat(planner): deterministic job list from accounts and template`.

---

## Phase 2: Local config (plain Clubspark accounts)

**Subagents (done):** Task 3 files + tests and README were produced **in parallel** (separate agents, disjoint paths); **integrator** added `commander` + `@types/node`, `config check` wiring, `loadConfig` guard for zero active accounts, removed stub `node-minimal.d.ts`, single commit.

- [x] **Task 3 — Config loader**
  - **Create** `config/accounts.example.json`: optional top-level keys (e.g. `venueBaseUrl`, default session times) plus **`accounts`**: `[{ "id", "label", "username", "password", "active": true }]` with placeholders; operators **copy** to `config/accounts.local.json` and fill real passwords.
  - **Create** `src/loadConfig.ts`: `loadConfig(configPath)` → `{ accounts: BookingAccount[], venueBaseUrl?: string, ... }` validated (Zod or hand validation); path from env `TENNIS_BOOKING_ACCOUNTS` or default `config/accounts.local.json`.
  - **Create** `tests/loadConfig.test.ts`: load a **fixture** file from `tests/fixtures/accounts.sample.json` (test-only fake passwords); assert parse + filter `active`.
  - **Commit:** `feat(config): load accounts from local json`.

- [x] **Task 4 — CLI validation**
  - **Wire** `src/cli.ts`: subcommand `config check` that loads `accounts.local.json` and prints **labels + usernames only** (never print passwords to stdout); exit non-zero if file missing or invalid.
  - README: **chmod 600** on `accounts.local.json`; never commit; backup awareness.
  - **Commit:** `feat(cli): validate accounts config without leaking secrets`.

---

## Phase 3: Ledger (court × time × access code)

- [x] **Task 5 — Ledger store**
  - **Create** `src/ledger/types.ts`: `LedgerRow` (sessionDate, courtLabel, start, end, accountId, accessCode?, status, bookingRef?, jobSequence).
  - **Create** `src/ledger/store.ts`: upsert from `PlannedJob` after plan; update code/status; `exportMarkdown(sessionDate)`.
  - **Create** `tests/ledger.test.ts`: create rows for 3 courts; manual set code; export contains codes.
  - **Commit:** `feat(ledger): pin ledger and export`.

---

## Phase 4: Playwright adapter (depends on Phase 0 notes)

- [x] **Task 6 — Auth + navigate**
  - **Create** `src/adapters/clubspark/auth.ts`: `login(page, username, password)` using **only** selectors from `selectors.ts`.
  - **Create** `src/adapters/clubspark/bookSlot.ts`: given `PlannedJob`, perform UI flow through **slot reserved** or **in basket** state (exact steps from spike doc).
  - Manual run: `tsx src/cli.ts dry-run --date YYYY-MM-DD` opens browser, logs in, stops before pay — verify no secrets logged.

- [x] **Task 7 — Payment (runtime args only)**
  - **Create** `src/adapters/clubspark/pay.ts`: accept **in-memory** object with card fields; fill form; submit; wait for success selector from spike; return `{ ok, confirmationText }`.
  - **Never** write card fields to disk; clear object after use in runner.
  - **Commit:** `feat(clubspark): checkout automation`.

Also added: `locator.ts`, `confirmation.ts` (gate PIN), CLI `dry-run`.

---

## Phase 5: Runner + CLI `run`

- [ ] **Task 8 — Runner**
  - **Create** `src/runner/runSession.ts`: load accounts + plan jobs; for each job: login → book → pay; on success append/update ledger (parse PIN from confirmation if present); on failure apply **abort** policy (default: stop run after first payment failure).
  - **Create** `src/cli.ts` subcommand `run --date ...` prompting for payment fields (use `readline` or `@inquirer/prompts` — mask CVV input).
  - **Commit:** `feat(runner): end-to-end session`.

---

## Phase 6: Hardening + docs

- [ ] **Task 9 — Safety**
  - Detect unexpected “verify” / 3DS iframe → throw typed error, screenshot **only** non-payment pages.
  - Idempotency: if confirmation says already booked, mark ledger accordingly and skip re-pay.

- [ ] **Task 10 — README**
  - Operator runbook: copy `config/accounts.example.json` → `accounts.local.json`, **chmod 600**, env `TENNIS_BOOKING_ACCOUNTS` if non-default path, `config check`, `run`, `ledger export`, dry-run, **PIN 30-minute activation** reminder, ToS disclaimer.

- [ ] **Commit:** `docs: operator runbook and safety checks`.

---

## Spec coverage (self-check)

| Spec section | Plan phase |
|--------------|------------|
| §5.1 Account registry (plain local config) | Phase 2 |
| §5.2 Template + planner | Phase 1 (+ config) |
| §5.3 Manual run + payment prompt | Phase 5 |
| §5.4 Execution | Phases 4–5 |
| §5.5 Reporting | Phase 5 (console) + 6 |
| §5.6 Access code ledger | Phase 3 (store) + 5 (runner wiring) |
| §7 Security (no account encryption; payment still ephemeral) | Phases 2, 4, 5, 6 |

---

## After this plan

1. Execute **Phase 0** before investing in adapter code.  
2. Implement phases **1 → 3** in order (all unit-testable without Clubspark).  
3. **4 → 5** require accurate selectors.  
4. Run a **real** booking only when the group accepts risk and venue rules allow it.

**Execution options:** implement **inline** in this repo task-by-task, or use a dedicated git worktree if other work is in flight.
