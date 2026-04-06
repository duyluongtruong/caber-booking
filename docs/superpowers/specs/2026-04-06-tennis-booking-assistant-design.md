# Tennis booking assistant — design spec (v1)

**Status:** Draft for review  
**Date:** 2026-04-06  
**Venue:** Caber Park Tennis Courts (Clubspark) — [Book by date](https://play.tennis.com.au/CaberParkTennisCourts/Booking/BookByDate)

---

## 1. Purpose

Build a **locally operated tool** that helps a regular group (~16–17 players) reserve **three courts** for a **Monday** session (default **07:30–10:00** local time), under Clubspark’s updated limits:

- Book up to **28 days** in advance  
- **Maximum 2 bookings per day** per account  
- **Maximum 2 hours per booking**

The group already coordinates **multiple member accounts** to cover three courts and a ~2.5h window; the tool should **reduce coordination error and manual repetition**, not bypass fair-use rules.

**v1 must:**

1. Store **multiple Clubspark credentials** in **local config** (each member account has its **own login** — username/password or equivalent). v1 assumes **single trusted machine**; passwords are **not encrypted** in the file for simplicity — see §7.1 for required hygiene.  
2. Support a **manual trigger** (“run now”) that prompts for **payment details once per run** (not persisted as full cardholder data).  
3. **Complete payment automatically** inside the browser automation, assuming **no 3-D Secure** step in normal operation.  
4. Produce a **clear per-account result** (success, failure reason, partial completion).  
5. Help the group **manage court access codes (PINs)** — typically **one code per booking**, often **delivered by email** to the account that made the booking — by recording **which code applies to which court and time** (see §5.6).

---

## 2. Non-goals (v1)

- Hosting a multi-tenant SaaS or shared cloud credential store.  
- Storing full card numbers, CVV, or magnetic-stripe–equivalent data **on disk** between runs.  
- Automatic scheduling / cron (“book at 00:01”) unless explicitly added later.  
- Automatically reading members’ **email inboxes** to ingest PINs (optional future); v1 uses **confirmation capture** and/or **manual code entry** (see §5.6).  
- Official Clubspark API integration (assume **no public API**; use **browser automation** unless proven otherwise).

---

## 3. Constraints and assumptions

### 3.1 Venue / platform

- Booking UI: **Clubspark web** (`play.tennis.com.au`), venue path includes `CaberParkTennisCourts`.  
- **PIN activation:** Site indicates booking PIN may take **~30 minutes** to activate; operators should book **well before** play ([booking page](https://play.tennis.com.au/CaberParkTennisCourts/Booking/BookByDate)).  
- **Payment:** Current group experience — **no 3DS** in the normal checkout path. v1 optimizes for that; still detect **unexpected** verification UI and **stop** rather than guess.

### 3.2 Legal and policy

- Operators must ensure use complies with **Clubspark / venue terms**, privacy policy, and any rules on automation or account use. This spec does not authorize violation of those terms.  
- Credentials belong to **real members**; access is **on behalf of those members** with consent.

### 3.3 Technical reality

- Clubspark may **change DOM** without notice; selectors and flows are **maintenance-sensitive**.  
- Peak load when windows open (e.g. 28-day mark) may cause **timeouts**; the tool should retry **judiciously** and avoid double-booking.

---

## 4. Actors

| Actor | Responsibility |
|--------|----------------|
| **Operator** | Triggers a run, supplies payment details for that run, verifies funds, reads results. |
| **Account owner** | Provides/stores their Clubspark login; agrees to automated booking on their account when a run uses it; may receive **court access code** emails for bookings made under their account. |

---

## 5. Functional requirements

### 5.1 Account registry (Clubspark login)

- Add, list, update, and disable **booking accounts** used to sign in to Clubspark: logical label (e.g. member name), **Clubspark username**, **password** (or other login secret).  
- **Not the same thing** as a **court access code (PIN)** sent after payment (see §5.6); one member may have one login but receive **multiple different PINs** if they hold multiple bookings.  
- **Persistence:** Accounts live in a **local config file** (e.g. JSON or YAML) alongside other group defaults (venue URL, default times). A **committed example** file (`accounts.example.json`) documents shape; the **real** file with passwords is **gitignored** and never pushed.  
- Optional metadata: notes, contact hint for “who checks email for PINs,” “max 2 bookings/day” flag (default on), inactive flag.

### 5.2 Booking template (group defaults)

- Configurable defaults: **weekday (Monday)**, **start 07:30**, **end 10:00**, **court count 3**, venue/site base URL or venue slug.  
- **Planner** computes a **deterministic assignment**: which account books which court segment, respecting **2 bookings/day** and **2h max per booking** per account.  
- Output: ordered list of **jobs** `{ account_id, court_id or court selection rule, start, end, sequence }`.

*Note:* Exact slot splitting (e.g. two 2h blocks vs. 2h + 0.5h) depends on **what the Clubspark UI allows** for contiguous play; v1 should encode the **group’s verified strategy** once observed on the live site (config-driven, not hard-coded magic).

### 5.3 Manual run

- Operator invokes **one run** for a **target date** (default: next applicable Monday in the 28-day window, or explicit date).  
- Prompt (CLI or minimal local UI) for **ephemeral payment fields** required by checkout (see §7.2).  
- Optional: **dry-run** mode — log in and navigate through selection **without** confirming payment (for testing selectors).

### 5.4 Execution

- For each job in order (or parallel where safe — see §8):  
  - Sign in as the assigned account.  
  - Select date, court, time per plan.  
  - Complete checkout using **runtime payment payload**.  
  - Record **outcome** and any **reference / confirmation** text the site shows.  
- If a step fails, **policy** is configurable: **abort entire run** vs **continue remaining jobs** (default recommendation: **abort** on payment failure; **configurable** on availability errors to avoid asymmetric partial bookings).

### 5.5 Reporting

- End-of-run summary: table of **account**, **intended slots**, **status**, **message**.  
- Non-payment **screenshots** optional; **never** capture payment step screens containing card data (or disable screenshots during payment).

### 5.6 Court access codes (PINs) — mapping “court + time → code”

Clubspark / venue flows often issue a **booking access code (PIN)** per reservation (the message that **PIN may take ~30 minutes to activate** refers to this). Codes are usually tied to **the member account that completed the booking** and may arrive by **email** separately from the on-screen confirmation.

**Problem:** With **multiple accounts** booking **multiple courts** and **multiple time segments**, the group needs a single place that answers: *for date D, court C, time T — what is the access code, and which booking does it belong to?*

**Requirements:**

1. **Ledger / schedule view** for a given **session date** (and optional run id): rows keyed by **`(court, start time, end time)`** (or venue’s native court id + slot), with columns at minimum: **access code** (nullable until known), **booking account** (which Clubspark account made that reservation), **job / confirmation reference** if captured, **status** (`pending_pin`, `confirmed`, `manual_override`).  
2. **Populate on success:** When a job completes successfully, create or update a ledger row with **court, time window, account_id**, and any **PIN or reference text parsed from the confirmation page** if the UI exposes it reliably.  
3. **Manual entry / edit:** Operator (or designated person) can **paste or type** an access code from email into the correct row if automation did not capture it or email arrives later. Support **correcting** a wrong slot assignment.  
4. **Link to planner output:** Each ledger row should **trace back** to the corresponding **planned job** (same date, court, time, account) so there is no ambiguity about *which* code goes with *which* court and time.  
5. **Group handoff:** Export or print-friendly summary (e.g. Markdown/CSV) listing **court, time, access code** for players at the gate — **omit** login passwords; codes are sensitive but are the operational secret for court entry.  
6. **Storage:** Persist ledger with the rest of local app data (e.g. JSON or SQLite). For v1 **local-only** use, **plain storage is acceptable** for PIN rows; treat the ledger file like the account config — **gitignored**, user-only file permissions. **Optional later:** encrypt ledger or accounts if the threat model changes.

**Out of scope for v1:** IMAP/OAuth email scraping to auto-import PINs; optional later enhancement.

---

## 6. Non-functional requirements

| Area | Requirement |
|------|-------------|
| **Security** | See §7. |
| **Reliability** | Idempotent where possible; detect “already booked” to avoid duplicate charges. |
| **Observability** | Structured logs without secrets; optional verbose mode for operator-only console. |
| **Maintainability** | Selectors and URLs centralized (e.g. config/module); short runbook for “Clubspark UI changed.” |

---

## 7. Security and privacy

### 7.1 Credential and access-code storage (local, plain config)

**Decision (v1):** Clubspark **passwords** are stored in **plain text in a local config file** because the tool runs only on a **trusted machine** and the group prefers simplicity over an encrypted vault.

**Required hygiene:**

- **Never commit** real credentials: use `.gitignore` for `accounts.local.json` (or equivalent) and keep only a **redacted example** in git.  
- **Restrict file permissions** on the machine (e.g. `chmod 600`) so other OS users cannot read the file.  
- **Backups / sync:** If the config is copied (cloud backup, USB), treat it as **highly sensitive** — same as writing passwords in a file.  
- **Optional upgrade path:** If requirements change, add encryption or OS keychain later without changing planner/adapter contracts.

- Never log **passwords** or **access codes** in application logs.  
- Ledger files holding PINs: same rules — gitignored, user-only permissions where the OS allows.

### 7.2 Payment data (runtime only)

- Accept full payment fields **only in memory** for the duration of the run.  
- **Do not write** PAN, CVV, or full track data to disk, logs, env files, or screenshots.  
- After run completion or fatal error, **clear** buffers (overwrite references where practical).

### 7.3 Compliance posture

- v1 targets **not storing** cardholder data persistently → avoids full PCI DSS “stored data” scope for the app itself. Payment still occurs on Clubspark / their processor; operators remain subject to **issuer and processor** rules.

---

## 8. Architecture (v1)

High-level modules:

1. **Local config** — load accounts + group defaults from disk (passwords in plain local file; gitignored).  
2. **Template + planner** — reads group rules + account list → **job list**.  
3. **Runner** — orchestrates jobs, applies abort/continue policy; on success, passes structured **booking outcome** to the ledger.  
4. **Clubspark adapter** — browser automation (recommended: **Playwright**): login, navigate, select slots, pay, read outcome; extract **confirmation / PIN** text when present in DOM.  
5. **Access code ledger** — persists **court × time × code × booking account**; supports manual edit and export.  
6. **CLI (or minimal desktop UI)** — trigger, prompts, dry-run flag, date override; **view/edit ledger** for a date or run.

**Suggested stack (implementation decision):** Node.js or Python + Playwright; single repo; run on **one trusted machine**.

---

## 9. Concurrency and ordering

- **Default:** Sequential execution per account (same account must not overlap two browser contexts).  
- Different accounts: **sequential v1** recommended to reduce rate-limit / IP suspicion and simplify debugging; **parallel** is a later optimization if needed.

---

## 10. Error handling (minimum set)

| Condition | Behavior |
|-----------|----------|
| Login failure | Fail job; record message; follow run policy. |
| Slot no longer available | Fail job; optional retry N times with backoff; operator alert. |
| Payment declined | Fail job; **do not** retry payment blindly. |
| Timeout / 5xx | Limited retries; then fail with captured error text. |
| Unexpected 3DS / verify UI | **Stop** job and run; operator message: manual intervention required. |

---

## 11. Testing

- **Fixture mode / recorded HTML** (optional): brittle; use sparingly.  
- **Staging:** Not available from venue → rely on **dry-run**, off-peak dates, or **cancelled** test bookings only if venue policy allows.  
- **Pre–booking-day rehearsal:** dry-run against a **non-target** date to validate selectors.

---

## 12. Open points (to resolve before / during implementation)

1. **Exact slot decomposition** for 3 courts × 07:30–10:00 under 2h booking max (as enforced by Clubspark UI).  
2. **Court identification** in the UI (court names/numbers and how they map in the DOM).  
3. **Checkout field list** (billing postcode, name on card, etc.) — capture once in a short “payment schema” section of the spec during implementation.  
4. **Abort vs continue** policy when one of three court bookings fails mid-run.  
5. **Initialization:** `git init` and project skeleton (language, package manager).  
6. **Confirmation page:** Whether PIN appears on-screen reliably enough for **automatic ledger fill** vs **email-only** manual entry for most bookings.

---

## 13. Acceptance criteria (v1)

- [ ] Operator can define ≥3 accounts in **local config** (gitignored); example template committed without secrets.  
- [ ] Planner produces a valid job list for **3 courts** and **Monday 07:30–10:00** under **2 bookings/day/account** and **2h/booking**.  
- [ ] Manual run prompts for payment data; **no** PAN/CVV on disk after run.  
- [ ] Successful run completes **payment** without 3DS in the assumed flow.  
- [ ] Summary report lists each job as success or failure with actionable text.  
- [ ] **Access code ledger** for a session date: **court + time window + booking account**, with **manual entry** and optional **auto-fill from confirmation** when available; **export** for players.  
- [ ] Documented operator runbook (how to trigger, dry-run, recover from failure, **fill PINs from email**).

---

## 14. Revision history

| Date | Change |
|------|--------|
| 2026-04-06 | Initial draft from requirements discussion |
| 2026-04-06 | Added §5.6 access code (PIN) ledger: court × time × code, email-driven manual entry, tie to booking account |
| 2026-04-06 | Accounts: plain local config (no encryption v1); §7.1 hygiene and optional upgrade path |
