# Ledger viewer — design spec (v1)

**Status:** Draft for review
**Date:** 2026-04-27
**Scope:** A static, GitHub-Pages-hosted React page that reads `data/ledger.json` and shows court / time / PIN for the current date, with date-search and court-filter controls.

---

## 1. Purpose

Today, all booking information (court, gate access PIN, time, date) lives in `data/ledger.json`. There is no friendly way to read it from a phone at the courts. This spec defines a tiny **read-only** web page that fetches that file and renders it.

**v1 must:**

1. Default to showing **today's** bookings (local browser date).
2. Let the user **search by date** (jump to any `YYYY-MM-DD`) and view that date's bookings.
3. Let the user **filter by court** within a date; consecutive time slots on the same court appear stacked under one court header.
4. Be **reactive** in the sense that controls update the visible list with no full page reload.
5. Apply **good UI/UX patterns**: mobile-first, large legible PINs, status badges instead of bare codes for non-confirmed rows, follows OS dark-mode preference.

The page is **read-only**. It never mutates the ledger.

---

## 2. Non-goals (v1)

- Editing the ledger from the page (mutations stay in the CLI).
- Authentication / passphrase / encryption — PINs are deemed not sensitive and the repo is public.
- Live data refresh (no websocket, polling, SSE). A page reload is the user's "refresh" action.
- Auto-`git push` after a booking run — update flow stays explicit.
- Multi-date list / "Upcoming" view / past-history page.
- Prev/Next day arrow nav.
- Multi-court filter (single-select chips only).
- Account / booking-ref / status-filter UI.
- Tap-to-copy PIN, share button, detail page.
- Markdown export from the viewer (CLI already has `exportMarkdown(sessionDate)`).
- Multi-venue support in the viewer; one repo = one venue, by convention.
- i18n / localisation (English-only).
- Service worker / offline cache.
- Custom theme toggle (OS preference is the toggle).
- React component visual-regression tests.

---

## 3. Constraints and assumptions

- **Hosting:** GitHub Pages, served from the repo's `data/` folder. Public URL is `https://<user>.github.io/tennis-booking/data/`.
- **Data path:** `data/ledger.json` (relative to `data/index.html`). The page fetches with `fetch('./ledger.json')`. Same path works under `file://` for local dev once a static server is running.
- **Update flow:** user runs CLI → ledger changes → `git add data/ledger.json && git commit && git push` → Pages rebuilds (~1 min).
- **`.gitignore`:** the `data/` line is removed (already done). `data/` is committed wholesale.
- **No auth / no encryption:** PINs are world-readable in `ledger.json`. The user has confirmed this is acceptable.
- **Stack:** TypeScript + React 18 + Vite. Build output committed under `data/`.
- **Self-contained:** React itself is bundled into `data/assets/`, not loaded from a CDN at runtime.
- **CLI half is unaffected:** existing `src/ledger/store.ts` continues to write `data/ledger.json` exactly as today; viewer does not change ledger I/O.
- **Browser support:** modern evergreen (Chrome / Safari / Firefox / Edge). No IE / no legacy.
- **Time zones:** `sessionDate` and times are wall-clock strings (`YYYY-MM-DD`, `HH:mm`). Viewer never converts time zones.

---

## 4. Architecture

### 4.1 File layout

```
tennis-booking/
├── src/
│   ├── ledger/
│   │   ├── types.ts              # existing — LedgerRow / LedgerFile
│   │   ├── store.ts              # existing — CLI side, unchanged
│   │   └── validate.ts           # NEW — isLedgerFile(x): x is LedgerFile (shared)
│   └── viewer/                   # NEW — viewer source (TS + React)
│       ├── index.html            # Vite entry; transformed into data/index.html
│       ├── main.tsx              # ReactDOM root
│       ├── App.tsx               # state owner: date + court + ledger + error
│       ├── ledger.ts             # fetchLedger() + LedgerLoadError
│       ├── selectors.ts          # pure: rowsForDate, distinctCourts, filterByCourt, groupByCourt, sortRowsForDisplay
│       ├── format.ts             # pure: formatDateHeader, pinOrBadge, todayIso
│       ├── styles.css            # ~80 lines, CSS variables, dark/light via prefers-color-scheme
│       └── components/
│           ├── DateBar.tsx
│           ├── CourtChips.tsx
│           ├── BookingList.tsx
│           ├── CourtCard.tsx
│           ├── BookingRow.tsx
│           └── EmptyState.tsx
├── data/                         # SERVED by GitHub Pages — committed
│   ├── index.html                # built by Vite
│   ├── assets/                   # built — hashed JS + CSS
│   │   ├── main-<hash>.js
│   │   └── main-<hash>.css
│   └── ledger.json               # written by CLI, untouched by viewer build
├── tests/
│   ├── viewer.selectors.test.ts  # NEW
│   ├── viewer.format.test.ts     # NEW
│   ├── viewer.ledger.test.ts     # NEW (stubs global.fetch)
│   └── fixtures/
│       └── ledger.viewer.sample.json   # NEW
├── vite.config.ts                # NEW
└── tsconfig.viewer.json          # NEW (extends existing tsconfig.json)
```

### 4.2 Module responsibilities

- **`src/ledger/validate.ts`** (new, shared) — exports `isLedgerFile(x: unknown): x is LedgerFile`. Used by the viewer; available to the CLI side for future defense-in-depth. The only structural change to existing CLI source is *adding* this file.
- **`src/viewer/ledger.ts`** — sole I/O surface. `fetchLedger()` does the `fetch`, parses JSON, validates shape, and throws a typed `LedgerLoadError("missing"|"parse"|"shape"|"network", msg)`.
- **`src/viewer/selectors.ts`** — pure functions over `LedgerFile`. No React, no fetch. Unit-tested.
- **`src/viewer/format.ts`** — pure presentation helpers (date header text, status → badge mapping, `todayIso()`). Unit-tested.
- **`src/viewer/App.tsx`** — owns `useState` for `(file, error, date, court)`. Calls `fetchLedger()` once on mount. Computes derived data each render via the pure selectors. Routes `error.kind` to the right `<EmptyState>`.
- **Components** — thin: take props, render. No fetching, no global state, no business logic.

### 4.3 State

```ts
const [file,  setFile]  = useState<LedgerFile | null>(null);
const [error, setError] = useState<LedgerLoadError | null>(null);
const [date,  setDate]  = useState<string>(todayIso());      // YYYY-MM-DD
const [court, setCourt] = useState<string | null>(null);     // null = "All"
```

Three of the four pieces are user-driven (`date`, `court`) or one-shot (`file`, `error`). No global store, no router, no memoisation needed at this scale.

### 4.4 Render shape (Layout A — court cards)

```
<App>
 ├─ <DateBar date onChange />
 ├─ <CourtChips courts selected onSelect />        // hidden if courts.length ≤ 1
 └─ <BookingList rows>
       └─ groupByCourt(rows)
             └─ <CourtCard court rows>
                   └─ <BookingRow row /> ×N
```

Visible rows are computed each render:

```ts
const todayRows = rowsForDate(file, date);
const courts    = distinctCourts(todayRows);
const visible   = sortRowsForDisplay(filterByCourt(todayRows, court));
const grouped   = groupByCourt(visible);          // [{ courtLabel, rows: LedgerRow[] }, …]
```

When `setDate` changes and the new date has no rows for the currently-selected court, an `useEffect` resets `setCourt(null)` so the user never sees an empty filter.

---

## 5. Data flow

### 5.1 Lifecycle

```
mount
  └─ fetchLedger()                     // GET ./ledger.json
       ├─ ok    → setFile(json)
       └─ throw → setError(err)        // typed LedgerLoadError
```

One fetch. No retries. No polling. A user-initiated reload is the only way to refresh data.

### 5.2 `fetchLedger` contract

```ts
export class LedgerLoadError extends Error {
  constructor(public kind: "missing" | "parse" | "shape" | "network", msg: string) { super(msg); }
}

export async function fetchLedger(): Promise<LedgerFile>
```

| Outcome                          | Branch                                              |
|----------------------------------|-----------------------------------------------------|
| 200 + valid JSON + valid shape   | resolve `LedgerFile`                                |
| 404                              | throw `LedgerLoadError("missing", …)`               |
| Other non-2xx / network failure  | throw `LedgerLoadError("network", …)`               |
| 200 but invalid JSON             | throw `LedgerLoadError("parse", …)`                 |
| 200 + valid JSON, wrong shape    | throw `LedgerLoadError("shape", "<field>")`         |

### 5.3 Selectors (pure)

| Function                                                | Purpose                                                            |
|---------------------------------------------------------|--------------------------------------------------------------------|
| `rowsForDate(file, date) → LedgerRow[]`                 | `[]` if date missing                                               |
| `distinctCourts(rows) → string[]`                       | unique `courtLabel`, sorted ascending                              |
| `filterByCourt(rows, court \| null) → LedgerRow[]`      | `null` is identity                                                 |
| `sortRowsForDisplay(rows) → LedgerRow[]`                | by `courtLabel` asc, then `start` asc                              |
| `groupByCourt(rows) → { courtLabel, rows }[]`           | preserves sort order; one entry per court                          |

Tests cover: empty inputs, single court, multiple courts, filter to non-existent court, sort stability.

### 5.4 Format helpers (pure)

| Function                                | Purpose                                                            |
|-----------------------------------------|--------------------------------------------------------------------|
| `todayIso() → string`                   | `YYYY-MM-DD` in local TZ                                           |
| `formatDateHeader(iso) → string`        | `"Mon · 27 Apr"` via `toLocaleDateString('en-AU', …)`              |
| `pinOrBadge(row) → PinOrBadge`          | discriminated union: `{ kind: 'pin', value }` or `{ kind: 'badge', label, tone }` |

`pinOrBadge` is the single source of status mapping (see §6.3).

---

## 6. Visual / UX (Layout A)

### 6.1 Mobile layout (320–480 px)

```
┌──────────────────────────────────────┐  16 px page padding
│  Mon · 27 Apr            [📅 picker] │  date bar — sticky, 56 px tall
├──────────────────────────────────────┤
│  [All] [Court 1] [Court 2]           │  court chips — sticky under date bar
├──────────────────────────────────────┤
│ ┌──────────────────────────────────┐ │
│ │ COURT 1                          │ │  card, 12 px radius, 14 px inner padding
│ │  19:30 – 20:00            1234   │ │  rows separated by 1 px hairline
│ │  20:00 – 20:30            5678   │ │
│ │  20:30 – 21:00       ⏳ pending  │ │
│ └──────────────────────────────────┘ │
│ ┌──────────────────────────────────┐ │
│ │ COURT 2                          │ │
│ │  19:30 – 20:00            9012   │ │
│ │  20:30 – 21:00         ⛔ failed │ │
│ └──────────────────────────────────┘ │
└──────────────────────────────────────┘
```

### 6.2 Card / row anatomy

`<CourtCard>` — `<article aria-labelledby="court-…">`, 12 px border-radius, padding `12px 14px`, `margin-bottom: 10px`. Court header is `<h2 id="court-…">` styled as 11 px uppercase letter-spaced muted text.

`<BookingRow>` — CSS grid, `grid-template-columns: 1fr auto`, `padding: 10px 0`, hairline `border-top` except the first child.

| Cell             | Content                              | Style                                        |
|------------------|--------------------------------------|----------------------------------------------|
| Time window      | `19:30 – 20:00` (en-dash, tabular)   | 13 px, primary text colour                   |
| PIN or badge     | Big monospace digits OR status pill  | 20 px monospace OR 11 px uppercase pill      |

### 6.3 Status → badge mapping

| `status`                       | Render               | Tone     |
|--------------------------------|----------------------|----------|
| `confirmed`                    | PIN digits           | n/a      |
| `manual_override`              | PIN digits + ✎       | n/a      |
| `pending_pin`                  | `⏳ pending`         | warn     |
| `not_started`                  | `· queued`           | muted    |
| `failed`                       | `⛔ failed`          | error    |
| (unknown string)               | raw string in pill   | muted    |
| `confirmed` with no PIN        | `⚠ no PIN`           | warn     |

### 6.4 Court chips

- Labels are full `courtLabel` (`Court 1`, not `C1`) to match card headers.
- Chips horizontally scroll if labels overflow.
- Hidden when the visible date has 0 or 1 court.
- Single-select; tapping the active chip toggles back to "All".
- When a court is selected, only that court's `<CourtCard>` renders.

### 6.5 Date bar

- Left: human label `Mon · 27 Apr`. Tapping focuses the picker.
- Right: native `<input type="date">` styled as a small pill (opens OS date wheel on mobile).
- "← Today" link beneath the label, only visible when `date !== todayIso()`.

### 6.6 Empty / loading / error states

| State                           | Rendering                                                          |
|---------------------------------|--------------------------------------------------------------------|
| Loading                         | One skeleton `<CourtCard>` with 3 shimmer rows. No spinner.        |
| Date empty                      | Centered: "No bookings on `<formatted date>`" + "← Today" link.    |
| File missing (404)              | Centered: "No ledger yet — run a booking and push."                |
| File corrupt (parse / shape)    | Centered: "Ledger file is corrupt." + collapsible raw error.       |
| Network error                   | Centered: "Couldn't load bookings. Check your connection."         |

All non-list states use a single `<EmptyState>` component, never wrapped in a card.

### 6.7 Theme

Dark by default; switches with `prefers-color-scheme: light`. CSS variables only, no toggle UI:

```css
:root {
  --bg: #ffffff;          --fg: #0f172a;
  --border: #e2e8f0;      --muted: #64748b;
  --accent: #2563eb;
  --card-bg: #ffffff;     --card-divider: #f1f5f9;
  --tone-warn-bg: #fef3c7;  --tone-warn-fg: #92400e;
  --tone-error-bg: #fee2e2; --tone-error-fg: #991b1b;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0f172a;          --fg: #e2e8f0;
    --border: #1e293b;      --muted: #94a3b8;
    --accent: #60a5fa;
    --card-bg: #1e293b;     --card-divider: #0f172a;
    --tone-warn-bg: #422006;  --tone-warn-fg: #fbbf24;
    --tone-error-bg: #450a0a; --tone-error-fg: #fca5a5;
  }
}
```

### 6.8 Responsive bounds

- Mobile (< 640 px): full-bleed, single column, `padding: 16px`.
- Tablet / desktop (≥ 640 px): centred, `max-width: 480px` — phone-shaped card on big screens.
- No landscape-specific styles.

### 6.9 Accessibility minimums

- Native `<input type="date">` and `<button>`s for chips. No custom keyboard handling.
- Each chip is `<button aria-pressed="…">`; the chip group has `role="group" aria-label="Filter by court"`.
- Status pills always include the status word as text — never icon-only.
- Colour is never the only signal: pills have a leading character (`⏳`, `⛔`, `⚠`, `✎`) plus the label.
- Contrast ≥ 4.5:1 on text in both themes.
- `<CourtCard>` is `<article aria-labelledby="court-…">` so screen readers announce "Court 1, article" before reading rows.

---

## 7. Build & deploy

### 7.1 `package.json`

Add scripts and devDeps. Existing CLI scripts (`build`, `test`, `cli`) untouched.

```jsonc
{
  "scripts": {
    "dev:viewer":     "vite",
    "prebuild:viewer":"rimraf data/assets",
    "build:viewer":   "vite build",
    "preview:viewer": "vite preview"
  },
  "devDependencies": {
    "vite": "^5.x",
    "@vitejs/plugin-react": "^4.x",
    "react": "^18.x",
    "react-dom": "^18.x",
    "@types/react": "^18.x",
    "@types/react-dom": "^18.x",
    "rimraf": "^5.x"
  }
}
```

### 7.2 `vite.config.ts`

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

`emptyOutDir: false` is critical — Vite must never wipe `data/ledger.json`. The `prebuild:viewer` script clears only `data/assets/` so old hashed files don't pile up.

### 7.3 `tsconfig.viewer.json`

A separate config so the viewer's `jsx` and `lib` settings don't leak into the CLI's `tsc` build. `noEmit: true` because Vite owns the viewer build.

### 7.4 What gets committed

| Path                                       | Committed? | Source / generated   |
|--------------------------------------------|------------|----------------------|
| `src/viewer/**`                            | yes        | source               |
| `vite.config.ts`, `tsconfig.viewer.json`   | yes        | source               |
| `data/index.html`                          | yes        | generated by Vite    |
| `data/assets/main-<hash>.js`               | yes        | generated by Vite    |
| `data/assets/main-<hash>.css`              | yes        | generated by Vite    |
| `data/ledger.json`                         | yes        | written by CLI       |
| `node_modules/`                            | no         | dep cache            |

### 7.5 GitHub Pages config (one-time)

Repo → Settings → Pages → Source = "Deploy from a branch", branch = `main`, folder = `/ (root)`. Public URL: `https://<user>.github.io/tennis-booking/data/`.

---

## 8. Testing strategy

### 8.1 What's tested

| Layer                            | Tested how                                | Why                             |
|----------------------------------|-------------------------------------------|---------------------------------|
| `selectors.ts` (pure)            | `node --test` (existing harness)          | All branching logic            |
| `format.ts` (pure)               | `node --test`                             | Status mapping, date formatting |
| `ledger.ts` (fetch wrapper)      | `node --test` with stubbed `global.fetch` | Single I/O contract             |
| React components                 | Eyeballed via `npm run dev:viewer`        | Thin; logic lives in selectors  |

### 8.2 Test files

```
tests/viewer.selectors.test.ts
tests/viewer.format.test.ts
tests/viewer.ledger.test.ts
tests/fixtures/ledger.viewer.sample.json
```

Picked up by the existing root script — no harness changes:

```text
"test": "node --test --import tsx tests/**/*.test.ts"
```

### 8.3 Fixture coverage

`ledger.viewer.sample.json` contains:

- Today's date with multiple courts and multiple time slots per court.
- A future date with one court, one row.
- A date where every status appears (`confirmed`, `pending_pin`, `failed`, `not_started`, `manual_override`).
- A `confirmed` row with no `accessCode` (covers the `⚠ no PIN` mapping).
- An empty date (key present, value `[]`).

### 8.4 What's not tested

- React rendering output — adding jsdom + RTL is out of proportion for a 5-component viewer.
- The Vite build itself.
- GitHub Pages serving.

### 8.5 Discipline

Every change to `selectors.ts` or `format.ts` ships with a test in the same PR. Components are exempt — when logic creeps in, extract it back to `selectors.ts` first.

---

## 9. Failure modes

| #  | Failure                                          | User sees                                                              | Handled in                  |
|----|--------------------------------------------------|------------------------------------------------------------------------|-----------------------------|
| 1  | `ledger.json` missing (404)                      | "No ledger yet — run a booking and push."                              | `ledger.ts` → `App.tsx`     |
| 2  | `ledger.json` malformed JSON                     | "Ledger file is corrupt — `<parse error>`."                            | `ledger.ts`                 |
| 3  | JSON parses but wrong shape                      | "Ledger has unexpected shape: `<field>`."                              | `ledger.ts` (validator)     |
| 4  | Date has zero rows                               | Inline empty state; chips and date bar stay usable                     | `BookingList.tsx`           |
| 5  | No data at all (`sessions: {}`)                  | Empty state with "No bookings recorded yet."                           | `BookingList.tsx`           |
| 6  | Court filter → empty court on new date           | Auto-reset filter to "All"                                             | `App.tsx` effect            |
| 7  | Row has unknown `status` string                  | Neutral grey badge with the raw string; never crashes                  | `format.ts`                 |
| 8  | Row's `accessCode` missing on `confirmed`        | `⚠ no PIN` badge (warn tone)                                           | `format.ts`                 |
| 9  | User hand-types invalid date                     | Empty state for that date; no error toast                              | n/a                         |
| 10 | Stale browser cache after `git push`             | Out of scope. Hard refresh fixes it.                                   | n/a                         |

All three load-failure rows (#1, #2, #3) flow through one `try/catch` in `ledger.ts` and one `LedgerLoadError` type. `App.tsx` switches on `error.kind` to pick wording.

Deliberately *not* caught:

- Mid-session network flakiness (only one fetch, on mount).
- React render errors (no error boundary; crash on bugs is preferred over silent half-renders).

---

## 10. Open items / deferred

Not in v1, may revisit if the design pinches in practice:

- Cache-buster query string on `./ledger.json` if Pages caching causes confusion.
- "Last updated `<time>`" line under the date bar.
- Tap-to-copy PIN digits.
- A `viewer:deploy` GitHub Action that rebuilds on push and validates the JSON.
- Putting `ledger.json` behind a passphrase or token if PIN visibility becomes a concern.

---

## 11. Acceptance criteria

The viewer is "done" for v1 when, after `npm install && npm run build:viewer && git push`:

1. `https://<user>.github.io/tennis-booking/data/` loads on a phone and shows today's bookings within ~2 seconds on a warm cache.
2. Tapping the date picker and choosing another date updates the list with no full-page reload.
3. Tapping a court chip filters to that court; tapping `All` (or the active chip again) restores all courts.
4. A row whose status is `confirmed` with an `accessCode` shows the PIN as 20 px monospace digits.
5. A row whose status is `pending_pin`, `failed`, or `not_started` shows a status pill (no PIN).
6. A date with zero bookings shows the empty state and a "← Today" link.
7. A missing or malformed `ledger.json` shows the corresponding error message — the page never blank-screens.
8. The page renders correctly in both light and dark mode driven by OS preference.
9. `npm test` passes; new viewer tests run alongside the existing 15 test files with no harness changes.
10. The CLI side (`npm run cli -- …`, `npm run build`) is unchanged in behaviour — only one additive file (`src/ledger/validate.ts`) is added on the CLI side.
