# tennis-booking

Local helper for multi-account Clubspark booking. The target venue is selected via config (`venueSlug`); Caber Park is the default.

## Prerequisites

- Node.js 20+
- npm

## Configuration

1. Copy `config/accounts.example.json` to `config/accounts.local.json`.
2. Fill in real credentials for your accounts.
3. Restrict permissions: `chmod 600 config/accounts.local.json`.

`config/accounts.local.json` is listed in `.gitignore` and must not be committed.

You need **at least three active accounts** in config: Monday evening is planned as **six** separate bookings (Courts **1–3**, **19:30–21:30** and **21:30–22:00** each, 24-hour times), two per account max.

### Venue (`venueSlug`)

- **`venueSlug`** in `accounts.local.json` selects the Clubspark venue (e.g. `"CaberParkTennisCourts"`). All booking, login, and Manage-bookings URLs are derived from it.
- If omitted, the slug is extracted from a legacy `venueBaseUrl`, otherwise it falls back to `CaberParkTennisCourts`.
- **`--venue <slug>`** on `dry-run`, `run`, `book-one`, and `read-pin` overrides the config slug for that single run (same accounts; different Clubspark venue URL).

### Environment

- **`TENNIS_BOOKING_ACCOUNTS`** (optional): path to the accounts JSON file. If unset, the default is `config/accounts.local.json`.
- **`TENNIS_BOOKING_LEDGER`** (optional): path to the PIN / session ledger JSON. Default: `data/ledger.json` (gitignored under `data/`).

### Session date (`--date` vs `--weeks`)

- **`--date YYYY-MM-DD`**: book that exact session night (overrides `--weeks`).
- **`--weeks N`** (non-negative integer): target Monday is **N Mondays after** the **upcoming** Monday (local time).  
  - **`--weeks 0`**: next Monday on or after today (today counts if it is Monday).  
  - **`--weeks 1`**: the Monday after that, etc.

Stay within the venue’s advance window (e.g. 28 days).

## Security

- Never commit real passwords or secrets.
- Treat backups and copies of `accounts.local.json` as sensitive material (same as production credentials).

## Commands

| Command | Purpose |
|--------|---------|
| `npm test` | Run tests |
| `npm run build` | TypeScript build |
| `npm run cli -- config check` | Validate accounts file; prints **label, id, username** only — never passwords |
| `npm run cli -- dry-run --weeks 0` | Plan **all 3 courts** Mon 19:30–22:00; open browser for **job 1 only** through basket — **no payment** |
| `npm run cli -- dry-run --date 2026-05-25` | Same, fixed session date |
| `npm run cli -- run --weeks 2` | Plan six jobs; prompt for card; run **every** checkout sequentially (**six charges**); write `data/ledger.json` + print Markdown |
| `npm run cli -- run --date 2026-05-25` | Same with explicit Monday date |
| `npm run cli -- book-one --date 2026-05-25 --court 1 --start 19:30 --end 22:00` | Plan one court (≤2h per checkout) and run each job; add `--account <id>` to pin a single account, `--dry-run` to stop at checkout |
| `npm run cli -- read-pin --date 2026-05-25 --account 1` | Open Manage bookings for an account and print the gate PIN for that session/court (no payment) |
| `npm run cli -- … --venue <slug>` | Override `venueSlug` from config for this run (any of `dry-run`, `run`, `book-one`, `read-pin`) |
| `npm run cli -- … --headless` | Use with `dry-run`, `run`, `book-one`, or `read-pin` for headless Chromium |

## Design

Full architecture and behavior are described under [`docs/superpowers/specs/`](docs/superpowers/specs/).

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
