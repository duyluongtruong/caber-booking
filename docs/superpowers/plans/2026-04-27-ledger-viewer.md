# Ledger Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `data/index.html` — a static, GitHub-Pages-hosted React 18 + Vite + TypeScript page that fetches `data/ledger.json` and shows court / time / PIN with date-search and per-court filtering, mobile-first Layout A (court cards).

**Architecture:** Pure logic (validator, selectors, format, fetch wrapper) lives under `src/ledger/` and `src/viewer/` as `.ts` modules with `node --test` coverage. React components are thin and eyeballed via `npm run dev:viewer`. Vite builds `src/viewer/index.html` into `data/index.html` + `data/assets/*` (hashed, committed). The CLI side is unchanged except for one new shared validator file.

**Tech Stack:** React 18, Vite 5, TypeScript 5, `@vitejs/plugin-react`, `rimraf`. Tests use the existing `node --test --import tsx` harness. No jsdom, no RTL, no Tailwind.

**Spec:** [`docs/superpowers/specs/2026-04-27-ledger-viewer-design.md`](../specs/2026-04-27-ledger-viewer-design.md)

---

## Task overview

| # | Task | TDD? | Output |
|---|------|------|--------|
| 1 | Add devDeps and base config (Vite, tsconfigs, scripts) | no | tooling boots |
| 2 | Test fixture for viewer | no | `tests/fixtures/ledger.viewer.sample.json` |
| 3 | Shared `isLedgerFile` validator | yes | `src/ledger/validate.ts` |
| 4 | `format.ts` — todayIso / formatDateHeader / pinOrBadge | yes | `src/viewer/format.ts` |
| 5 | `selectors.ts` — pure list operations | yes | `src/viewer/selectors.ts` |
| 6 | `ledger.ts` — `fetchLedger` + `LedgerLoadError` | yes | `src/viewer/ledger.ts` |
| 7 | `styles.css` — theme variables and base classes | no | `src/viewer/styles.css` |
| 8 | `<EmptyState>` component | no | `src/viewer/components/EmptyState.tsx` |
| 9 | `<BookingRow>` component | no | `src/viewer/components/BookingRow.tsx` |
| 10 | `<CourtCard>` component | no | `src/viewer/components/CourtCard.tsx` |
| 11 | `<CourtChips>` component | no | `src/viewer/components/CourtChips.tsx` |
| 12 | `<DateBar>` component | no | `src/viewer/components/DateBar.tsx` |
| 13 | `<BookingList>` component | no | `src/viewer/components/BookingList.tsx` |
| 14 | `<App>` wiring + `main.tsx` | no | viewer renders real data |
| 15 | First production build + commit `data/` artefacts | no | `data/index.html`, `data/assets/*` |
| 16 | README updates | no | docs reflect viewer |

---

## Task 1: Build scaffolding (Vite + React + tsconfigs + scripts)

**Files:**
- Modify: `package.json`
- Create: `vite.config.ts`
- Create: `tsconfig.viewer.json`
- Modify: `tsconfig.json`
- Create: `src/viewer/index.html`
- Create: `src/viewer/main.tsx` (placeholder — replaced in Task 14)
- Create: `src/viewer/App.tsx` (placeholder — replaced in Task 14)

- [ ] **Step 1: Install dev dependencies**

Run:

```bash
npm install --save-dev \
  vite \
  @vitejs/plugin-react \
  react \
  react-dom \
  @types/react \
  @types/react-dom \
  rimraf
```

Expected: install completes, `package-lock.json` updates. React/React-DOM are devDeps because they're bundled into `data/assets/`, never required at runtime by the CLI side.

- [ ] **Step 2: Add npm scripts to `package.json`**

Edit `package.json` `"scripts"` to add four lines (keep existing scripts):

```jsonc
{
  "scripts": {
    "build": "tsc",
    "test": "node --test --import tsx tests/**/*.test.ts",
    "cli": "tsx src/cli.ts",
    "codegen": "playwright codegen \"https://play.tennis.com.au/CaberParkTennisCourts/Booking/BookByDate#?role=guest\"",
    "dev:viewer":      "vite",
    "prebuild:viewer": "rimraf data/assets",
    "build:viewer":    "vite build",
    "preview:viewer":  "vite preview"
  }
}
```

- [ ] **Step 3: Create `tsconfig.viewer.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "isolatedModules": true,
    "allowImportingTsExtensions": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true
  },
  "include": ["src/viewer/**/*", "src/ledger/types.ts", "src/ledger/validate.ts"]
}
```

- [ ] **Step 4: Exclude viewer source from CLI `tsconfig.json`**

The CLI build (`npm run build`) uses `src/**/*` and would choke on `.tsx`. Exclude the viewer:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "skipLibCheck": true,
    "noEmitOnError": true
  },
  "include": ["src/**/*"],
  "exclude": ["src/viewer/**"]
}
```

- [ ] **Step 5: Create `vite.config.ts` at repo root**

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  root: path.resolve(__dirname, "src/viewer"),
  base: "./",
  build: {
    outDir: path.resolve(__dirname, "data"),
    emptyOutDir: false,
    assetsDir: "assets",
    rollupOptions: {
      input: path.resolve(__dirname, "src/viewer/index.html"),
    },
  },
});
```

- [ ] **Step 6: Create `src/viewer/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#0f172a" />
    <title>Tennis bookings</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 7: Create placeholder `src/viewer/App.tsx`**

```tsx
export function App() {
  return <main style={{ padding: 16, fontFamily: "system-ui" }}>viewer scaffold</main>;
}
```

- [ ] **Step 8: Create placeholder `src/viewer/main.tsx`**

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("root element missing");
createRoot(rootEl).render(<StrictMode><App /></StrictMode>);
```

- [ ] **Step 9: Verify the dev server boots**

Run:

```bash
npm run dev:viewer
```

Expected: Vite prints `Local: http://localhost:5173/` (or similar). Open it in a browser → you should see `viewer scaffold`. Stop the server with Ctrl-C.

- [ ] **Step 10: Verify the production build emits to `data/`**

Run:

```bash
npm run build:viewer
```

Expected: command exits 0; `data/index.html` exists and references `./assets/main-<hash>.js`; `data/assets/main-<hash>.js` exists; `data/ledger.json` is **untouched**. Verify:

```bash
ls -la data/
ls -la data/assets/
```

- [ ] **Step 11: Verify CLI build still passes**

The viewer must not break the CLI:

```bash
npm run build
```

Expected: `tsc` exits 0; no errors about `.tsx` files (because we excluded `src/viewer/**`).

- [ ] **Step 12: Verify existing tests still pass**

```bash
npm test
```

Expected: existing 15 test files pass with no changes.

- [ ] **Step 13: Commit**

```bash
git add package.json package-lock.json tsconfig.json tsconfig.viewer.json vite.config.ts src/viewer/index.html src/viewer/App.tsx src/viewer/main.tsx data/index.html data/assets/
git commit -m "feat(viewer): scaffold React + Vite + TS build into data/"
```

---

## Task 2: Test fixture for viewer modules

**Files:**
- Create: `tests/fixtures/ledger.viewer.sample.json`

- [ ] **Step 1: Create the fixture**

This fixture is consumed by tasks 3, 4, 5. It contains: today-ish dates with multiple courts, every status value, a `confirmed` row missing `accessCode`, and an empty-array date.

```json
{
  "sessions": {
    "2099-01-01": [
      {
        "sessionDate": "2099-01-01",
        "courtLabel": "Court 1",
        "start": "19:30",
        "end": "20:00",
        "accountId": "acc-1",
        "jobSequence": 1,
        "status": "confirmed",
        "accessCode": "1234"
      },
      {
        "sessionDate": "2099-01-01",
        "courtLabel": "Court 1",
        "start": "20:00",
        "end": "20:30",
        "accountId": "acc-2",
        "jobSequence": 2,
        "status": "confirmed",
        "accessCode": "5678"
      },
      {
        "sessionDate": "2099-01-01",
        "courtLabel": "Court 2",
        "start": "19:30",
        "end": "20:00",
        "accountId": "acc-1",
        "jobSequence": 3,
        "status": "pending_pin"
      }
    ],
    "2099-02-01": [
      {
        "sessionDate": "2099-02-01",
        "courtLabel": "Court 3",
        "start": "10:00",
        "end": "11:00",
        "accountId": "acc-1",
        "jobSequence": 1,
        "status": "manual_override",
        "accessCode": "9999",
        "bookingRef": "ABC123"
      },
      {
        "sessionDate": "2099-02-01",
        "courtLabel": "Court 3",
        "start": "11:00",
        "end": "12:00",
        "accountId": "acc-2",
        "jobSequence": 2,
        "status": "failed"
      },
      {
        "sessionDate": "2099-02-01",
        "courtLabel": "Court 3",
        "start": "12:00",
        "end": "13:00",
        "accountId": "acc-3",
        "jobSequence": 3,
        "status": "not_started"
      },
      {
        "sessionDate": "2099-02-01",
        "courtLabel": "Court 1",
        "start": "08:00",
        "end": "09:00",
        "accountId": "acc-4",
        "jobSequence": 4,
        "status": "confirmed"
      }
    ],
    "2099-03-01": []
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add tests/fixtures/ledger.viewer.sample.json
git commit -m "test(viewer): add sample ledger fixture covering all statuses"
```

---

## Task 3: Shared `isLedgerFile` validator (TDD)

**Files:**
- Create: `src/ledger/validate.ts`
- Test: `tests/ledger.validate.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/ledger.validate.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isLedgerFile } from "../src/ledger/validate.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = JSON.parse(
  readFileSync(path.join(HERE, "fixtures/ledger.viewer.sample.json"), "utf8"),
);

test("isLedgerFile: accepts the sample fixture", () => {
  assert.equal(isLedgerFile(FIXTURE), true);
});

test("isLedgerFile: accepts an empty sessions object", () => {
  assert.equal(isLedgerFile({ sessions: {} }), true);
});

test("isLedgerFile: rejects non-object root", () => {
  assert.equal(isLedgerFile(null), false);
  assert.equal(isLedgerFile([]), false);
  assert.equal(isLedgerFile("nope"), false);
});

test("isLedgerFile: rejects missing 'sessions' key", () => {
  assert.equal(isLedgerFile({}), false);
});

test("isLedgerFile: rejects 'sessions' that is not a record", () => {
  assert.equal(isLedgerFile({ sessions: [] }), false);
  assert.equal(isLedgerFile({ sessions: null }), false);
});

test("isLedgerFile: rejects a row missing required fields", () => {
  assert.equal(
    isLedgerFile({ sessions: { "2099-01-01": [{ courtLabel: "Court 1" }] } }),
    false,
  );
});

test("isLedgerFile: rejects a row with an unknown status", () => {
  assert.equal(
    isLedgerFile({
      sessions: {
        "2099-01-01": [
          {
            sessionDate: "2099-01-01",
            courtLabel: "Court 1",
            start: "19:30",
            end: "20:00",
            accountId: "a",
            jobSequence: 1,
            status: "bogus",
          },
        ],
      },
    }),
    false,
  );
});
```

- [ ] **Step 2: Run the test and confirm it fails**

```bash
npm test -- tests/ledger.validate.test.ts
```

Expected: FAIL — `Cannot find module '../src/ledger/validate.ts'`.

- [ ] **Step 3: Implement `src/ledger/validate.ts`**

```ts
import type { LedgerFile, LedgerRow, LedgerStatus } from "./types.js";

const STATUSES: ReadonlySet<LedgerStatus> = new Set([
  "not_started",
  "pending_pin",
  "confirmed",
  "manual_override",
  "failed",
]);

function isString(x: unknown): x is string {
  return typeof x === "string";
}

function isNumber(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x);
}

function isLedgerRow(x: unknown): x is LedgerRow {
  if (typeof x !== "object" || x === null) return false;
  const r = x as Record<string, unknown>;
  if (!isString(r.sessionDate)) return false;
  if (!isString(r.courtLabel)) return false;
  if (!isString(r.start)) return false;
  if (!isString(r.end)) return false;
  if (!isString(r.accountId)) return false;
  if (!isNumber(r.jobSequence)) return false;
  if (!isString(r.status) || !STATUSES.has(r.status as LedgerStatus)) return false;
  if (r.accessCode !== undefined && !isString(r.accessCode)) return false;
  if (r.bookingRef !== undefined && !isString(r.bookingRef)) return false;
  return true;
}

export function isLedgerFile(x: unknown): x is LedgerFile {
  if (typeof x !== "object" || x === null || Array.isArray(x)) return false;
  const root = x as Record<string, unknown>;
  const sessions = root.sessions;
  if (typeof sessions !== "object" || sessions === null || Array.isArray(sessions)) return false;
  for (const rows of Object.values(sessions as Record<string, unknown>)) {
    if (!Array.isArray(rows)) return false;
    for (const row of rows) if (!isLedgerRow(row)) return false;
  }
  return true;
}
```

- [ ] **Step 4: Run the test and confirm it passes**

```bash
npm test -- tests/ledger.validate.test.ts
```

Expected: 7 tests pass.

- [ ] **Step 5: Run the full suite to ensure nothing else broke**

```bash
npm test
```

Expected: existing tests + new 7 tests all pass.

- [ ] **Step 6: Commit**

```bash
git add src/ledger/validate.ts tests/ledger.validate.test.ts
git commit -m "feat(ledger): add shared isLedgerFile validator"
```

---

## Task 4: `format.ts` — todayIso / formatDateHeader / pinOrBadge (TDD)

**Files:**
- Create: `src/viewer/format.ts`
- Test: `tests/viewer.format.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/viewer.format.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { formatDateHeader, pinOrBadge, todayIso } from "../src/viewer/format.ts";
import type { LedgerRow } from "../src/ledger/types.ts";

function row(overrides: Partial<LedgerRow>): LedgerRow {
  return {
    sessionDate: "2099-01-01",
    courtLabel: "Court 1",
    start: "19:30",
    end: "20:00",
    accountId: "acc",
    jobSequence: 1,
    status: "confirmed",
    accessCode: "1234",
    ...overrides,
  };
}

test("todayIso: returns YYYY-MM-DD in local TZ", () => {
  const iso = todayIso();
  assert.match(iso, /^\d{4}-\d{2}-\d{2}$/);
  const d = new Date();
  const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  assert.equal(iso, expected);
});

test("formatDateHeader: renders 'Mon · 27 Apr' style for a known date", () => {
  // 2099-04-27 is a Monday
  const out = formatDateHeader("2099-04-27");
  assert.match(out, /Mon/);
  assert.match(out, /27/);
  assert.match(out, /Apr/);
});

test("formatDateHeader: handles invalid input by returning the raw string", () => {
  assert.equal(formatDateHeader("not-a-date"), "not-a-date");
});

test("pinOrBadge: confirmed with accessCode → pin", () => {
  const r = row({ status: "confirmed", accessCode: "1234" });
  assert.deepEqual(pinOrBadge(r), { kind: "pin", value: "1234" });
});

test("pinOrBadge: manual_override with accessCode → pin with edited flag", () => {
  const r = row({ status: "manual_override", accessCode: "9999" });
  assert.deepEqual(pinOrBadge(r), { kind: "pin", value: "9999", edited: true });
});

test("pinOrBadge: confirmed with NO accessCode → warn 'no PIN'", () => {
  const r = row({ status: "confirmed", accessCode: undefined });
  assert.deepEqual(pinOrBadge(r), { kind: "badge", label: "⚠ no PIN", tone: "warn" });
});

test("pinOrBadge: pending_pin → warn 'pending'", () => {
  const r = row({ status: "pending_pin", accessCode: undefined });
  assert.deepEqual(pinOrBadge(r), { kind: "badge", label: "⏳ pending", tone: "warn" });
});

test("pinOrBadge: failed → error 'failed'", () => {
  const r = row({ status: "failed", accessCode: undefined });
  assert.deepEqual(pinOrBadge(r), { kind: "badge", label: "⛔ failed", tone: "error" });
});

test("pinOrBadge: not_started → muted 'queued'", () => {
  const r = row({ status: "not_started", accessCode: undefined });
  assert.deepEqual(pinOrBadge(r), { kind: "badge", label: "· queued", tone: "muted" });
});

test("pinOrBadge: unknown status → muted with raw label", () => {
  const r = { ...row({}), status: "weird" as unknown as LedgerRow["status"] };
  assert.deepEqual(pinOrBadge(r), { kind: "badge", label: "weird", tone: "muted" });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

```bash
npm test -- tests/viewer.format.test.ts
```

Expected: FAIL — module missing.

- [ ] **Step 3: Implement `src/viewer/format.ts`**

```ts
import type { LedgerRow } from "../ledger/types.js";

export type Tone = "warn" | "error" | "muted";
export type PinOrBadge =
  | { kind: "pin"; value: string; edited?: true }
  | { kind: "badge"; label: string; tone: Tone };

export function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function formatDateHeader(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(d.getTime())) return iso;
  // Example: "Mon · 27 Apr"
  const weekday = d.toLocaleDateString("en-AU", { weekday: "short" });
  const day = d.toLocaleDateString("en-AU", { day: "2-digit" });
  const month = d.toLocaleDateString("en-AU", { month: "short" });
  return `${weekday} · ${day} ${month}`;
}

export function pinOrBadge(row: LedgerRow): PinOrBadge {
  if (row.status === "confirmed") {
    if (row.accessCode) return { kind: "pin", value: row.accessCode };
    return { kind: "badge", label: "⚠ no PIN", tone: "warn" };
  }
  if (row.status === "manual_override") {
    if (row.accessCode) return { kind: "pin", value: row.accessCode, edited: true };
    return { kind: "badge", label: "⚠ no PIN", tone: "warn" };
  }
  if (row.status === "pending_pin") return { kind: "badge", label: "⏳ pending", tone: "warn" };
  if (row.status === "failed") return { kind: "badge", label: "⛔ failed", tone: "error" };
  if (row.status === "not_started") return { kind: "badge", label: "· queued", tone: "muted" };
  return { kind: "badge", label: String(row.status), tone: "muted" };
}
```

- [ ] **Step 4: Run the test and confirm it passes**

```bash
npm test -- tests/viewer.format.test.ts
```

Expected: 10 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/viewer/format.ts tests/viewer.format.test.ts
git commit -m "feat(viewer): add format helpers (todayIso, formatDateHeader, pinOrBadge)"
```

---

## Task 5: `selectors.ts` — pure list operations (TDD)

**Files:**
- Create: `src/viewer/selectors.ts`
- Test: `tests/viewer.selectors.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/viewer.selectors.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  distinctCourts,
  filterByCourt,
  groupByCourt,
  rowsForDate,
  sortRowsForDisplay,
} from "../src/viewer/selectors.ts";
import type { LedgerFile } from "../src/ledger/types.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = JSON.parse(
  readFileSync(path.join(HERE, "fixtures/ledger.viewer.sample.json"), "utf8"),
) as LedgerFile;

test("rowsForDate: returns rows for a present date", () => {
  const rows = rowsForDate(FIXTURE, "2099-01-01");
  assert.equal(rows.length, 3);
});

test("rowsForDate: returns [] for an absent date", () => {
  assert.deepEqual(rowsForDate(FIXTURE, "1900-01-01"), []);
});

test("rowsForDate: returns [] when sessions key is empty array", () => {
  assert.deepEqual(rowsForDate(FIXTURE, "2099-03-01"), []);
});

test("rowsForDate: returns [] when file is null", () => {
  assert.deepEqual(rowsForDate(null, "2099-01-01"), []);
});

test("distinctCourts: returns sorted unique court labels", () => {
  const rows = rowsForDate(FIXTURE, "2099-02-01");
  assert.deepEqual(distinctCourts(rows), ["Court 1", "Court 3"]);
});

test("distinctCourts: returns [] for empty rows", () => {
  assert.deepEqual(distinctCourts([]), []);
});

test("filterByCourt: null returns input unchanged", () => {
  const rows = rowsForDate(FIXTURE, "2099-01-01");
  assert.equal(filterByCourt(rows, null).length, 3);
});

test("filterByCourt: filters to matching court", () => {
  const rows = rowsForDate(FIXTURE, "2099-01-01");
  const filtered = filterByCourt(rows, "Court 2");
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].courtLabel, "Court 2");
});

test("filterByCourt: empty when no match", () => {
  const rows = rowsForDate(FIXTURE, "2099-01-01");
  assert.deepEqual(filterByCourt(rows, "Court 99"), []);
});

test("sortRowsForDisplay: sorts by court asc, then start asc", () => {
  const rows = rowsForDate(FIXTURE, "2099-02-01");
  const sorted = sortRowsForDisplay(rows);
  assert.deepEqual(
    sorted.map((r) => `${r.courtLabel} ${r.start}`),
    ["Court 1 08:00", "Court 3 10:00", "Court 3 11:00", "Court 3 12:00"],
  );
});

test("sortRowsForDisplay: does not mutate input", () => {
  const rows = rowsForDate(FIXTURE, "2099-02-01");
  const original = rows.map((r) => `${r.courtLabel} ${r.start}`);
  sortRowsForDisplay(rows);
  assert.deepEqual(rows.map((r) => `${r.courtLabel} ${r.start}`), original);
});

test("groupByCourt: groups in court-asc order with rows in start-asc order", () => {
  const rows = sortRowsForDisplay(rowsForDate(FIXTURE, "2099-02-01"));
  const groups = groupByCourt(rows);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].courtLabel, "Court 1");
  assert.equal(groups[0].rows.length, 1);
  assert.equal(groups[1].courtLabel, "Court 3");
  assert.deepEqual(
    groups[1].rows.map((r) => r.start),
    ["10:00", "11:00", "12:00"],
  );
});

test("groupByCourt: empty input → empty output", () => {
  assert.deepEqual(groupByCourt([]), []);
});
```

- [ ] **Step 2: Run the test and confirm it fails**

```bash
npm test -- tests/viewer.selectors.test.ts
```

Expected: FAIL — module missing.

- [ ] **Step 3: Implement `src/viewer/selectors.ts`**

```ts
import type { LedgerFile, LedgerRow } from "../ledger/types.js";

export function rowsForDate(file: LedgerFile | null, date: string): LedgerRow[] {
  if (!file) return [];
  return file.sessions[date] ?? [];
}

export function distinctCourts(rows: readonly LedgerRow[]): string[] {
  const set = new Set<string>();
  for (const r of rows) set.add(r.courtLabel);
  return [...set].sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
}

export function filterByCourt(
  rows: readonly LedgerRow[],
  court: string | null,
): LedgerRow[] {
  if (court === null) return [...rows];
  return rows.filter((r) => r.courtLabel === court);
}

export function sortRowsForDisplay(rows: readonly LedgerRow[]): LedgerRow[] {
  return [...rows].sort((a, b) => {
    const c = a.courtLabel.localeCompare(b.courtLabel, "en", { numeric: true });
    if (c !== 0) return c;
    return a.start.localeCompare(b.start);
  });
}

export type CourtGroup = { courtLabel: string; rows: LedgerRow[] };

export function groupByCourt(rows: readonly LedgerRow[]): CourtGroup[] {
  const groups: CourtGroup[] = [];
  for (const r of rows) {
    const last = groups[groups.length - 1];
    if (last && last.courtLabel === r.courtLabel) {
      last.rows.push(r);
    } else {
      groups.push({ courtLabel: r.courtLabel, rows: [r] });
    }
  }
  return groups;
}
```

- [ ] **Step 4: Run the test and confirm it passes**

```bash
npm test -- tests/viewer.selectors.test.ts
```

Expected: 13 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/viewer/selectors.ts tests/viewer.selectors.test.ts
git commit -m "feat(viewer): add pure selectors (rowsForDate, distinctCourts, filterByCourt, sortRowsForDisplay, groupByCourt)"
```

---

## Task 6: `ledger.ts` — `fetchLedger` + `LedgerLoadError` (TDD)

**Files:**
- Create: `src/viewer/ledger.ts`
- Test: `tests/viewer.ledger.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/viewer.ledger.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchLedger, LedgerLoadError } from "../src/viewer/ledger.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_TEXT = readFileSync(
  path.join(HERE, "fixtures/ledger.viewer.sample.json"),
  "utf8",
);

type FetchImpl = typeof globalThis.fetch;

function withFetch<T>(impl: FetchImpl, fn: () => Promise<T>): Promise<T> {
  const real = globalThis.fetch;
  globalThis.fetch = impl;
  return fn().finally(() => {
    globalThis.fetch = real;
  });
}

test("fetchLedger: 200 + valid JSON + valid shape → resolves LedgerFile", async () => {
  await withFetch(
    async () => new Response(FIXTURE_TEXT, { status: 200 }),
    async () => {
      const file = await fetchLedger();
      assert.equal(typeof file.sessions, "object");
      assert.ok(file.sessions["2099-01-01"]);
    },
  );
});

test("fetchLedger: 404 → throws LedgerLoadError(missing)", async () => {
  await withFetch(
    async () => new Response("not found", { status: 404 }),
    async () => {
      await assert.rejects(
        () => fetchLedger(),
        (e) => e instanceof LedgerLoadError && e.kind === "missing",
      );
    },
  );
});

test("fetchLedger: 500 → throws LedgerLoadError(network)", async () => {
  await withFetch(
    async () => new Response("boom", { status: 500 }),
    async () => {
      await assert.rejects(
        () => fetchLedger(),
        (e) => e instanceof LedgerLoadError && e.kind === "network",
      );
    },
  );
});

test("fetchLedger: network throw → LedgerLoadError(network)", async () => {
  await withFetch(
    async () => {
      throw new Error("offline");
    },
    async () => {
      await assert.rejects(
        () => fetchLedger(),
        (e) => e instanceof LedgerLoadError && e.kind === "network",
      );
    },
  );
});

test("fetchLedger: invalid JSON body → LedgerLoadError(parse)", async () => {
  await withFetch(
    async () => new Response("{not json", { status: 200 }),
    async () => {
      await assert.rejects(
        () => fetchLedger(),
        (e) => e instanceof LedgerLoadError && e.kind === "parse",
      );
    },
  );
});

test("fetchLedger: valid JSON, wrong shape → LedgerLoadError(shape)", async () => {
  await withFetch(
    async () => new Response(JSON.stringify({ sessions: "nope" }), { status: 200 }),
    async () => {
      await assert.rejects(
        () => fetchLedger(),
        (e) => e instanceof LedgerLoadError && e.kind === "shape",
      );
    },
  );
});
```

- [ ] **Step 2: Run the test and confirm it fails**

```bash
npm test -- tests/viewer.ledger.test.ts
```

Expected: FAIL — module missing.

- [ ] **Step 3: Implement `src/viewer/ledger.ts`**

```ts
import type { LedgerFile } from "../ledger/types.js";
import { isLedgerFile } from "../ledger/validate.js";

export type LedgerLoadKind = "missing" | "parse" | "shape" | "network";

export class LedgerLoadError extends Error {
  constructor(public readonly kind: LedgerLoadKind, message: string) {
    super(message);
    this.name = "LedgerLoadError";
  }
}

export async function fetchLedger(url: string = "./ledger.json"): Promise<LedgerFile> {
  let res: Response;
  try {
    res = await fetch(url, { cache: "no-cache" });
  } catch (e) {
    throw new LedgerLoadError("network", e instanceof Error ? e.message : String(e));
  }

  if (res.status === 404) {
    throw new LedgerLoadError("missing", "ledger.json not found");
  }
  if (!res.ok) {
    throw new LedgerLoadError("network", `HTTP ${res.status}`);
  }

  let raw: unknown;
  try {
    raw = await res.json();
  } catch (e) {
    throw new LedgerLoadError("parse", e instanceof Error ? e.message : String(e));
  }

  if (!isLedgerFile(raw)) {
    throw new LedgerLoadError("shape", "ledger.json does not match expected shape");
  }

  return raw;
}
```

- [ ] **Step 4: Run the test and confirm it passes**

```bash
npm test -- tests/viewer.ledger.test.ts
```

Expected: 6 tests pass.

- [ ] **Step 5: Run the full suite to ensure nothing broke**

```bash
npm test
```

Expected: 15 existing files + 4 new files (validate, format, selectors, ledger) all pass.

- [ ] **Step 6: Commit**

```bash
git add src/viewer/ledger.ts tests/viewer.ledger.test.ts
git commit -m "feat(viewer): add fetchLedger with typed LedgerLoadError"
```

---

## Task 7: `styles.css` — theme variables and base classes

**Files:**
- Create: `src/viewer/styles.css`
- Modify: `src/viewer/main.tsx` (add `import "./styles.css";`)

- [ ] **Step 1: Create `src/viewer/styles.css`**

```css
:root {
  --bg: #ffffff;
  --fg: #0f172a;
  --muted: #64748b;
  --border: #e2e8f0;
  --accent: #2563eb;
  --card-bg: #ffffff;
  --card-divider: #f1f5f9;
  --tone-warn-bg: #fef3c7;
  --tone-warn-fg: #92400e;
  --tone-error-bg: #fee2e2;
  --tone-error-fg: #991b1b;
  --tone-muted-bg: transparent;
  --tone-muted-fg: #64748b;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0f172a;
    --fg: #e2e8f0;
    --muted: #94a3b8;
    --border: #1e293b;
    --accent: #60a5fa;
    --card-bg: #1e293b;
    --card-divider: #0f172a;
    --tone-warn-bg: #422006;
    --tone-warn-fg: #fbbf24;
    --tone-error-bg: #450a0a;
    --tone-error-fg: #fca5a5;
    --tone-muted-bg: transparent;
    --tone-muted-fg: #94a3b8;
  }
}

* { box-sizing: border-box; }

html, body {
  margin: 0;
  padding: 0;
  background: var(--bg);
  color: var(--fg);
  font: 400 14px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
}

#root {
  max-width: 480px;
  margin: 0 auto;
  padding: 16px;
}

.date-bar {
  position: sticky;
  top: 0;
  background: var(--bg);
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 8px 0 12px;
  z-index: 2;
}

.date-bar .label { font-weight: 600; font-size: 16px; }
.date-bar .today-link {
  display: inline-block;
  margin-top: 4px;
  font-size: 12px;
  color: var(--accent);
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
}
.date-bar input[type="date"] {
  font: inherit;
  color: var(--fg);
  background: var(--border);
  border: none;
  border-radius: 999px;
  padding: 6px 12px;
}

.chips {
  position: sticky;
  top: 56px;
  background: var(--bg);
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding: 8px 0 12px;
  z-index: 1;
  scrollbar-width: none;
}
.chips::-webkit-scrollbar { display: none; }

.chip {
  flex: 0 0 auto;
  background: var(--border);
  color: var(--fg);
  border: none;
  border-radius: 999px;
  padding: 6px 12px;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.chip[aria-pressed="true"] {
  background: var(--accent);
  color: white;
  font-weight: 600;
}

.court-card {
  background: var(--card-bg);
  border-radius: 12px;
  padding: 12px 14px;
  margin-bottom: 10px;
}
.court-card h2 {
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
  margin: 0 0 8px;
  font-weight: 600;
}

.row {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  padding: 10px 0;
  border-top: 1px solid var(--card-divider);
}
.row:first-of-type { border-top: none; }
.row .time {
  color: var(--fg);
  font-variant-numeric: tabular-nums;
  font-size: 13px;
}
.row .pin {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-weight: 600;
  font-size: 20px;
  letter-spacing: 0.04em;
  color: var(--fg);
}
.row .pin .edited-mark {
  font-family: -apple-system, system-ui, sans-serif;
  font-size: 12px;
  color: var(--muted);
  margin-left: 4px;
}

.pill {
  font-size: 11px;
  padding: 3px 9px;
  border-radius: 999px;
  text-transform: lowercase;
  display: inline-block;
}
.pill.warn  { background: var(--tone-warn-bg);  color: var(--tone-warn-fg); }
.pill.error { background: var(--tone-error-bg); color: var(--tone-error-fg); }
.pill.muted { background: var(--tone-muted-bg); color: var(--tone-muted-fg); border: 1px solid var(--border); }

.empty {
  text-align: center;
  padding: 48px 16px;
  color: var(--muted);
}
.empty .big { font-size: 14px; color: var(--fg); margin-bottom: 6px; }
.empty .small { font-size: 12px; }
.empty .small button {
  background: none;
  border: none;
  padding: 0;
  color: var(--accent);
  font: inherit;
  cursor: pointer;
}

.skeleton {
  background: var(--card-bg);
  border-radius: 12px;
  padding: 12px 14px;
  margin-bottom: 10px;
}
.skeleton .bar {
  height: 14px;
  background: var(--card-divider);
  border-radius: 4px;
  margin: 8px 0;
  animation: shimmer 1.4s infinite ease-in-out;
}
@keyframes shimmer {
  0%, 100% { opacity: 1; }
  50%      { opacity: 0.5; }
}
```

- [ ] **Step 2: Import the stylesheet from `main.tsx`**

Edit `src/viewer/main.tsx`:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import "./styles.css";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("root element missing");
createRoot(rootEl).render(<StrictMode><App /></StrictMode>);
```

- [ ] **Step 3: Visual smoke check**

Run `npm run dev:viewer` and open the Vite URL. The page should still show "viewer scaffold" (placeholder), now with system font + correct background colour for your OS theme. Stop the server.

- [ ] **Step 4: Commit**

```bash
git add src/viewer/styles.css src/viewer/main.tsx
git commit -m "feat(viewer): add base CSS theme variables and component classes"
```

---

## Task 8: `<EmptyState>` component

**Files:**
- Create: `src/viewer/components/EmptyState.tsx`

- [ ] **Step 1: Create `src/viewer/components/EmptyState.tsx`**

```tsx
type Props = {
  title: string;
  hint?: string;
  onHintClick?: () => void;
  details?: string;
};

export function EmptyState({ title, hint, onHintClick, details }: Props) {
  return (
    <div className="empty">
      <div className="big">{title}</div>
      {hint && (
        <div className="small">
          {onHintClick ? (
            <button type="button" onClick={onHintClick}>{hint}</button>
          ) : (
            hint
          )}
        </div>
      )}
      {details && (
        <details style={{ marginTop: 12, textAlign: "left", fontSize: 12 }}>
          <summary>Details</summary>
          <pre style={{ whiteSpace: "pre-wrap", overflow: "auto" }}>{details}</pre>
        </details>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/viewer/components/EmptyState.tsx
git commit -m "feat(viewer): add EmptyState component"
```

---

## Task 9: `<BookingRow>` component

**Files:**
- Create: `src/viewer/components/BookingRow.tsx`

- [ ] **Step 1: Create `src/viewer/components/BookingRow.tsx`**

```tsx
import type { LedgerRow } from "../../ledger/types.ts";
import { pinOrBadge } from "../format.ts";

type Props = { row: LedgerRow };

export function BookingRow({ row }: Props) {
  const view = pinOrBadge(row);
  return (
    <div className="row">
      <span className="time">{row.start} – {row.end}</span>
      {view.kind === "pin" ? (
        <span className="pin">
          {view.value}
          {view.edited && <span className="edited-mark" aria-label="manually entered">✎</span>}
        </span>
      ) : (
        <span className={`pill ${view.tone}`}>{view.label}</span>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/viewer/components/BookingRow.tsx
git commit -m "feat(viewer): add BookingRow component"
```

---

## Task 10: `<CourtCard>` component

**Files:**
- Create: `src/viewer/components/CourtCard.tsx`

- [ ] **Step 1: Create `src/viewer/components/CourtCard.tsx`**

```tsx
import type { LedgerRow } from "../../ledger/types.ts";
import { BookingRow } from "./BookingRow.tsx";

type Props = { courtLabel: string; rows: readonly LedgerRow[] };

export function CourtCard({ courtLabel, rows }: Props) {
  const headingId = `court-${courtLabel.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <article className="court-card" aria-labelledby={headingId}>
      <h2 id={headingId}>{courtLabel}</h2>
      {rows.map((r) => (
        <BookingRow
          key={`${r.sessionDate}-${r.courtLabel}-${r.start}-${r.jobSequence}`}
          row={r}
        />
      ))}
    </article>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/viewer/components/CourtCard.tsx
git commit -m "feat(viewer): add CourtCard component"
```

---

## Task 11: `<CourtChips>` component

**Files:**
- Create: `src/viewer/components/CourtChips.tsx`

- [ ] **Step 1: Create `src/viewer/components/CourtChips.tsx`**

```tsx
type Props = {
  courts: readonly string[];
  selected: string | null;
  onSelect: (court: string | null) => void;
};

export function CourtChips({ courts, selected, onSelect }: Props) {
  if (courts.length <= 1) return null;
  const handle = (court: string | null) => {
    if (court !== null && court === selected) onSelect(null);
    else onSelect(court);
  };
  return (
    <div className="chips" role="group" aria-label="Filter by court">
      <button
        type="button"
        className="chip"
        aria-pressed={selected === null}
        onClick={() => handle(null)}
      >
        All
      </button>
      {courts.map((c) => (
        <button
          key={c}
          type="button"
          className="chip"
          aria-pressed={selected === c}
          onClick={() => handle(c)}
        >
          {c}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/viewer/components/CourtChips.tsx
git commit -m "feat(viewer): add CourtChips component"
```

---

## Task 12: `<DateBar>` component

**Files:**
- Create: `src/viewer/components/DateBar.tsx`

- [ ] **Step 1: Create `src/viewer/components/DateBar.tsx`**

```tsx
import { formatDateHeader, todayIso } from "../format.ts";

type Props = {
  date: string;
  onChange: (date: string) => void;
};

export function DateBar({ date, onChange }: Props) {
  const today = todayIso();
  return (
    <header className="date-bar">
      <div>
        <div className="label">{formatDateHeader(date)}</div>
        {date !== today && (
          <button
            type="button"
            className="today-link"
            onClick={() => onChange(today)}
            aria-label="Jump to today"
          >
            ← Today
          </button>
        )}
      </div>
      <input
        type="date"
        value={date}
        onChange={(e) => onChange(e.currentTarget.value)}
        aria-label="Pick a date"
      />
    </header>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/viewer/components/DateBar.tsx
git commit -m "feat(viewer): add DateBar component"
```

---

## Task 13: `<BookingList>` component

**Files:**
- Create: `src/viewer/components/BookingList.tsx`

- [ ] **Step 1: Create `src/viewer/components/BookingList.tsx`**

```tsx
import type { LedgerRow } from "../../ledger/types.ts";
import { groupByCourt } from "../selectors.ts";
import { CourtCard } from "./CourtCard.tsx";

type Props = { rows: readonly LedgerRow[] };

export function BookingList({ rows }: Props) {
  const groups = groupByCourt(rows);
  return (
    <section>
      {groups.map((g) => (
        <CourtCard key={g.courtLabel} courtLabel={g.courtLabel} rows={g.rows} />
      ))}
    </section>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/viewer/components/BookingList.tsx
git commit -m "feat(viewer): add BookingList component"
```

---

## Task 14: `<App>` wiring + `main.tsx`

**Files:**
- Modify: `src/viewer/App.tsx` (replace placeholder)

- [ ] **Step 1: Replace `src/viewer/App.tsx` with the real implementation**

```tsx
import { useEffect, useState } from "react";
import type { LedgerFile } from "../ledger/types.ts";
import { fetchLedger, LedgerLoadError } from "./ledger.ts";
import {
  distinctCourts,
  filterByCourt,
  rowsForDate,
  sortRowsForDisplay,
} from "./selectors.ts";
import { formatDateHeader, todayIso } from "./format.ts";
import { DateBar } from "./components/DateBar.tsx";
import { CourtChips } from "./components/CourtChips.tsx";
import { BookingList } from "./components/BookingList.tsx";
import { EmptyState } from "./components/EmptyState.tsx";

export function App() {
  const [file, setFile]   = useState<LedgerFile | null>(null);
  const [error, setError] = useState<LedgerLoadError | null>(null);
  const [date, setDate]   = useState<string>(todayIso());
  const [court, setCourt] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchLedger().then(
      (f) => { if (!cancelled) setFile(f); },
      (e) => { if (!cancelled) setError(e instanceof LedgerLoadError ? e : new LedgerLoadError("network", String(e))); },
    );
    return () => { cancelled = true; };
  }, []);

  const todayRows = rowsForDate(file, date);
  const courts    = distinctCourts(todayRows);
  const visible   = sortRowsForDisplay(filterByCourt(todayRows, court));

  useEffect(() => {
    if (court !== null && !courts.includes(court)) setCourt(null);
  }, [court, courts]);

  if (error) {
    return (
      <>
        <DateBar date={date} onChange={setDate} />
        {renderError(error)}
      </>
    );
  }

  if (file === null) {
    return (
      <>
        <DateBar date={date} onChange={setDate} />
        <div className="skeleton" aria-busy="true">
          <div className="bar" style={{ width: "40%" }} />
          <div className="bar" style={{ width: "85%" }} />
          <div className="bar" style={{ width: "85%" }} />
          <div className="bar" style={{ width: "85%" }} />
        </div>
      </>
    );
  }

  return (
    <>
      <DateBar date={date} onChange={setDate} />
      <CourtChips courts={courts} selected={court} onSelect={setCourt} />
      {visible.length === 0 ? (
        <EmptyState
          title={`No bookings on ${formatDateHeader(date)}`}
          hint={date !== todayIso() ? "← Today" : undefined}
          onHintClick={date !== todayIso() ? () => setDate(todayIso()) : undefined}
        />
      ) : (
        <BookingList rows={visible} />
      )}
    </>
  );
}

function renderError(err: LedgerLoadError) {
  if (err.kind === "missing") {
    return <EmptyState title="No ledger yet — run a booking and push." />;
  }
  if (err.kind === "parse" || err.kind === "shape") {
    return <EmptyState title="Ledger file is corrupt." details={err.message} />;
  }
  return (
    <EmptyState
      title="Couldn't load bookings."
      hint="Check your connection and reload."
      details={err.message}
    />
  );
}
```

- [ ] **Step 2: Smoke check in dev server**

Make sure `data/ledger.json` exists (it does in this repo). Then:

```bash
npm run dev:viewer
```

Open the Vite URL. Verify in the browser:

1. The header shows today's date (e.g. "Mon · 27 Apr").
2. If today has bookings in `data/ledger.json`, you see the court cards. Otherwise you see "No bookings on …" with a "← Today" link hidden (because we *are* on today).
3. Click the date input → pick `2026-05-04` → the list updates without a page reload.
4. If multiple courts show, the chip row appears; click "Court 1" → only that card remains; click "All" or the active chip again → both return.
5. Toggle your OS theme between light and dark → the page repaints in the matching theme.
6. Open the URL on your phone (use Vite's network URL, e.g. `http://192.168.x.x:5173`) — verify it looks right at 320–400 px wide.

If anything looks wrong, fix it now (typically CSS tweaks or component prop wiring) before the build commit. Do not advance until all six checks pass.

- [ ] **Step 3: Verify the full test suite still passes**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/viewer/App.tsx
git commit -m "feat(viewer): wire App with fetch lifecycle, derived state, and error states"
```

---

## Task 15: First production build + commit `data/` artefacts

**Files:**
- Modify: `data/index.html` (regenerated)
- Create: `data/assets/main-<hash>.js` (regenerated)
- Create: `data/assets/main-<hash>.css` (regenerated)

- [ ] **Step 1: Build the viewer**

```bash
npm run build:viewer
```

Expected: `prebuild:viewer` clears `data/assets/`; Vite emits `data/index.html` + `data/assets/main-<hash>.js` + `data/assets/main-<hash>.css`. `data/ledger.json` is untouched.

- [ ] **Step 2: Preview the production bundle**

```bash
npm run preview:viewer
```

Expected: a static server hosts `data/`. Open the printed URL → the page loads `./assets/main-<hash>.js` and `./ledger.json` over HTTP, identical behaviour to dev. Verify your six dev-server checks again. Stop the server.

- [ ] **Step 3: Commit the build artefacts**

```bash
git add data/index.html data/assets/
git commit -m "build(viewer): commit production bundle to data/ for GitHub Pages"
```

- [ ] **Step 4: Verify everything still passes**

```bash
npm test && npm run build && npm run build:viewer
```

Expected: tests pass, CLI build passes, viewer build passes.

---

## Task 16: README updates

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add a "Viewer" section to `README.md`**

Append after the `## Commands` table:

```markdown
## Viewer (`data/index.html`)

A static React page hosted from `data/` on GitHub Pages that displays each session's court / time / PIN.

| Command | Purpose |
|---------|---------|
| `npm run dev:viewer` | Run Vite dev server on `http://localhost:5173/` for hand-editing components |
| `npm run build:viewer` | Build the page into `data/index.html` + `data/assets/*` (committed) |
| `npm run preview:viewer` | Serve the built `data/` folder locally to verify before pushing |

After a booking run mutates `data/ledger.json`, commit and push to refresh the public page:

```bash
git add data/ledger.json && git commit -m "data: ledger" && git push
```

GitHub Pages must be enabled in repo Settings → Pages, source `main` / `/ (root)`. The public URL is `https://<user>.github.io/tennis-booking/data/`.

Source lives in `src/viewer/`. The build output (`data/index.html`, `data/assets/*`) is committed so that GitHub Pages serves it directly with no CI step.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs(readme): document viewer scripts and Pages deploy flow"
```

---

## Verification checklist (run before merging)

- [ ] `npm test` — all tests pass (existing 15 files + 4 new viewer files = ~36 tests).
- [ ] `npm run build` — CLI builds with no `.tsx` errors (viewer is excluded from CLI tsconfig).
- [ ] `npm run build:viewer` — produces deterministic output in `data/`, leaves `data/ledger.json` untouched.
- [ ] `npm run preview:viewer` — page loads, shows today's bookings or empty state, date picker works, court chips work, dark/light mode follows OS.
- [ ] After pushing, GitHub Pages URL renders the same page with live `ledger.json`.
- [ ] CLI behaviour is unchanged: `npm run cli -- config check`, `dry-run`, `run`, `book-one`, `read-pin` work exactly as before.
