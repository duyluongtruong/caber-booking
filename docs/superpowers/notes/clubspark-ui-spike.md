# Clubspark UI spike — Caber Park (Phase 0)

**Purpose:** Capture real navigation steps and **selector strategy** before implementing `src/adapters/clubspark/*.ts`.

**Booking URL (guest-capable):**  
https://play.tennis.com.au/CaberParkTennisCourts/Booking/BookByDate#?date=YYYY-MM-DD&role=guest

**Venue note:** PIN may take **~30 minutes** to activate after booking; book **early** if possible.

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
| 1 | Open booking | *(fill)* | Hash routing `#?date=...` |
| 2 | Open sign-in | *(fill)* | |
| 3 | Username | *(fill)* | |
| 4 | Password | *(fill)* | |
| 5 | Submit login | *(fill)* | |

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
