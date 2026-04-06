# tennis-booking

Local helper for multi-account Clubspark (Caber Park) booking.

## Prerequisites

- Node.js 20+
- npm

## Configuration

1. Copy `config/accounts.example.json` to `config/accounts.local.json`.
2. Fill in real credentials for your accounts.
3. Restrict permissions: `chmod 600 config/accounts.local.json`.

`config/accounts.local.json` is listed in `.gitignore` and must not be committed.

### Environment

- **`TENNIS_BOOKING_ACCOUNTS`** (optional): path to the accounts JSON file. If unset, the default is `config/accounts.local.json`.
- **`TENNIS_BOOKING_LEDGER`** (optional): path to the PIN / session ledger JSON. Default: `data/ledger.json` (gitignored under `data/`).

## Security

- Never commit real passwords or secrets.
- Treat backups and copies of `accounts.local.json` as sensitive material (same as production credentials).

## Commands

| Command | Purpose |
|--------|---------|
| `npm test` | Run tests |
| `npm run build` | TypeScript build |
| `npm run cli -- config check` | Validate `config/accounts.local.json` (or `TENNIS_BOOKING_ACCOUNTS`); prints **label, id, username** only — never passwords |
| `npm run cli -- config check --config /path/to/file.json` | Validate a specific accounts file |
| `npm run cli -- dry-run --date 2026-05-25` | Headed browser: sign in (first account), select date, add **Court 1** 07:30 slot through basket — **no payment**; pauses for inspection |
| `npm run cli -- dry-run --date 2026-05-25 --headless` | Same flow headless; short wait then exit |

## Design

Full architecture and behavior are described under [`docs/superpowers/specs/`](docs/superpowers/specs/).
