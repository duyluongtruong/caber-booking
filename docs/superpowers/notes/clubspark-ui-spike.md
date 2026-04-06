# Clubspark UI spike — Caber Park (Phase 0)

**Purpose:** Capture real navigation steps and **selector strategy** before implementing `src/adapters/clubspark/*.ts`.

**Booking URL (guest-capable):**  
https://play.tennis.com.au/CaberParkTennisCourts/Booking/BookByDate#?date=YYYY-MM-DD&role=guest

**Venue note:** PIN may take **~30 minutes** to activate after booking; book **early** if possible.

**Security:** Never paste codegen output that contains **passwords or card numbers** into git or shared docs. Rotate the password if it was exposed.

---

## Deduped happy path (codegen — mirrored in `src/adapters/clubspark/selectors.ts`)

Codegen often repeats steps (retries, mis-typed email). Use **one** clean sequence:

1. `page.goto` booking URL (`bookingUrl({ date, role: 'guest' })` or member).  
2. `getByTestId('sign-in-link')` → sign-in panel.  
3. `getByRole('textbox', { name: 'Email address' })` → fill username.  
4. `getByRole('textbox', { name: 'Password' })` → fill password.  
5. `getByRole('button', { name: 'Sign in' })` → submit **once**.  
6. If shown: `getByRole('button', { name: 'Close this dialog' })` (cookie banner) — prefer close, not clicking the dialog chrome.  
7. `getByRole('button', { name: 'Select a date' })`.  
8. `getByTitle('Next')` until the right month.  
9. `getByRole('link', { name: '<day>' })` where `<day>` is `1`–`31` (no leading zero) — see `calendarDayLink(dayOfMonth)`.  
10. Slot row: codegen used `locator('[data-test-id="booking-…|YYYY-MM-DD|…"]')` — use `bookingSlotRow(sessionDate)` (substring on `|date|`). If multiple cells match, disambiguate by court in the adapter.  
11. `getByRole('button', { name: 'Continue booking' })`.  
12. Terms: `getByText(/Please tick this box to/i)` (or associated checkbox if you find a better locator).  
13. `getByRole('button', { name: 'Continue' })`.  
14. `getByRole('button', { name: 'Confirm and pay' })` → **Stripe Elements** payment.

### Stripe (card)

- Card number / expiry / CVC live in **separate iframes**. Codegen often records `iframe[name="__privateStripeFrame7753"]` — **do not hardcode**; the digits change every load.
- **Stable:** accessible names **inside** each iframe (`Credit or debit card number`, `Credit or debit card expiry`, `Credit or debit card CVC/CVV`).
- **Host page:** wrapper ids like `#cs-stripe-elements-card-cvc` + child `iframe` — see `STRIPE_CARD_FRAMES` in `selectors.ts` (verify `card-number` / `card-expiry` wrapper ids in DevTools).
- Submit: `getByRole('button', { name: /Pay \$/ })` (amount suffix varies).

### Booking confirmation

- Redirect URL: `/CaberParkTennisCourts/Booking/BookingConfirmation/{uuid}` — wait with `waitForURL`, do **not** paste a fixed UUID from codegen.
- Success: `getByRole('heading', { name: /Your booking has been/i })`.
- Month banner: heading whose name matches `Month YYYY` (e.g. May 2026) — see `CONFIRMATION.calendarMonthHeading` in `selectors.ts`.
- PIN section: heading **Your pin code**, label **Gate Pin code**, then one line **`Court N: {digits}`** (e.g. `Court 3: 0782`). Same line holds the gate PIN — use `confirmationCourtLine(n)` (same idea as `getByText('Court 3:')`) and `parseGatePinFromCourtRow(innerText)` in `selectors.ts`.

---

## How to record selectors (operator steps)

1. From repo root, run:

   ```bash
   npm install
   npx playwright install chromium
   npm run codegen
   ```

2. In the Playwright Inspector window, complete the flow **as far as safe**:
   - **Sign in** (use a real member account when you are ready; use a **non-critical date** or cancel test bookings per venue rules).
   - Open the target **date**.
   - Select **one court** and **one 2-hour** (or allowed) slot.
   - Proceed until the **payment** screen, then **stop** before submitting real card data unless you intend a real purchase.

3. Use **Copy** in the Inspector to export suggested locators. Prefer, in order:
   - `getByRole(...)` with accessible name  
   - `getByLabel(...)`  
   - `getByTestId(...)` if present  
   - Last resort: stable `data-*` or `#id` — avoid long CSS chains.

4. Paste findings into the sections below and mirror string constants in `src/adapters/clubspark/selectors.ts`.

---

## 1. Sign-in flow

| Step | Action | Locator / URL | Notes |
|------|--------|---------------|--------|
| 1 | Open booking | *https://play.tennis.com.au/CaberParkTennisCourts/Booking/BookByDate#?date=2026-04-06&role=guest* | Hash routing `#?date=...` |
| 2 | Open sign-in | *sign-in-link* | |
| 3 | Username | *Email address* | |
| 4 | Password | *Password* | |
| 5 | Submit login | *Sign in* | |

**Post-login URL or marker:** *(fill)*

---

## 2. Date selection

| Element | Locator | Notes |
|---------|---------|--------|
| Date picker / calendar | *(fill)* | |
| Confirm date | *(fill)* | |

---

## 3. Court + time slot

| Element | Locator | Notes |
|---------|---------|--------|
| Court list / grid | *(fill)* | Court names as shown in UI |
| Time slot (2h) | *(fill)* | |
| Add to basket / Continue | *(fill)* | |

**Court labels in UI (exact strings):** *(fill — e.g. Court 1, Court 2 …)*

---

## 4. Basket / checkout

| Step | Locator | Notes |
|------|---------|--------|
| View basket | *(fill)* | |
| Proceed to payment | *(fill)* | |

---

## 5. Payment form (do not store real card data in this file)

| Field | Locator | Notes |
|-------|---------|--------|
| Card number | *(fill)* | |
| Expiry | *(fill)* | |
| CVV | *(fill)* | |
| Name on card | *(fill)* | |
| Billing / postcode | *(fill)* | |
| Pay / Submit | *(fill)* | |

**3DS / verify iframe observed?** *(yes / no — if yes, describe)*

---

## 6. Confirmation / access code (PIN)

**Does the confirmation page show a PIN or access code in the DOM?**

- *(fill: yes/no)*

**If yes — where (selector + example text pattern):** *(fill)*

**If no — email only:** note for ledger **manual PIN entry** after run.

---

## 7. Fragile areas

- *(fill: modals, loading spinners, sold-out state, error toasts)*

---

## Revision

| Date | Author | Notes |
|------|--------|--------|
| 2026-04-06 | — | Template created (Phase 0) |
