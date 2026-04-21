/**
 * Clubspark / Caber Park — values for Playwright locators.
 *
 * Mapped from Playwright codegen (deduplicated). Adapter should map each
 * `LocatorSpec` to `page.getBy*` / `page.locator` calls.
 *
 * Full spike notes: `docs/superpowers/notes/clubspark-ui-spike.md`
 */

export const CABER_PARK_BOOKING_BASE =
  "https://play.tennis.com.au/CaberParkTennisCourts/Booking/BookByDate";

export const CABER_PARK_MANAGE_BOOKINGS =
  "https://play.tennis.com.au/CaberParkTennisCourts/Booking/Bookings";

/** Build booking URL with optional date (YYYY-MM-DD) and role. */
export function bookingUrl(opts?: { date?: string; role?: "guest" | "member" }) {
  const params = new URLSearchParams();
  if (opts?.date) params.set("date", opts.date);
  if (opts?.role) params.set("role", opts.role);
  const hash = params.toString() ? `#?${params.toString()}` : "";
  return `${CABER_PARK_BOOKING_BASE}${hash}`;
}

/** How to find one control; adapter maps this to Playwright calls. */
export type LocatorSpec =
  | {
      kind: "role";
      role: "link" | "button" | "textbox" | "combobox" | "spinbutton" | "heading" | "dialog";
      name: string | RegExp;
    }
  | { kind: "label"; text: string | RegExp }
  | { kind: "placeholder"; text: string | RegExp }
  | { kind: "text"; text: string | RegExp }
  | { kind: "testId"; id: string }
  | { kind: "title"; text: string }
  | { kind: "css"; selector: string };

// --- Sign-in (one clean sequence; ignore duplicate retries from codegen) ---

export const SIGN_IN = {
  entry: { kind: "testId", id: "sign-in-link" } as const,
  username: { kind: "role", role: "textbox", name: "Email address" } as const,
  password: { kind: "role", role: "textbox", name: "Password" } as const,
  submit: { kind: "role", role: "button", name: "Sign in" } as const,
};

/** Optional: appears after load / login. Close instead of clicking the dialog body. */
export const COOKIE_CONSENT = {
  close: { kind: "role", role: "button", name: "Close this dialog" } as const,
  /** Only if you need to target the banner (prefer `close`). */
  dialog: { kind: "role", role: "dialog", name: "Cookie Consent Banner" } as const,
};

// --- Date → court/time cell (from codegen; duplicates removed) ---

export const BOOKING_FLOW = {
  openDatePicker: { kind: "role", role: "button", name: "Select a date" } as const,
  calendarNextMonth: { kind: "title", text: "Next" } as const,
  /** After choosing month/year, pick day of month (link text is usually `1`–`31` without leading zero). */
  continueBooking: { kind: "role", role: "button", name: "Continue booking" } as const,
  /** Terms step — label may be longer; partial match. */
  termsAccept: { kind: "text", text: /Please tick this box to/i } as const,
  continueAfterTerms: { kind: "role", role: "button", name: "Continue" } as const,
  /** Opens Stripe (`payWithCard`). Prefer `#paynow` in adapter when present — Caber Park uses that id + `data-stripe-payment`. */
  confirmAndPay: { kind: "role", role: "button", name: "Confirm and pay" } as const,
};

/** Basket → Stripe: stable id on Clubspark checkout (text still “Confirm and pay”). */
export const STRIPE_PAY_NOW = "#paynow";

/** Day cell in the calendar grid (Playwright: `getByRole('link', { name: '25' })`). */
export function calendarDayLink(dayOfMonth: number): LocatorSpec {
  return { kind: "role", role: "link", name: String(dayOfMonth) };
}

/**
 * Grid anchor `data-test-id`:
 * `booking-{resourceUuid}|YYYY-MM-DD|{minutesSinceMidnight}` (30-minute steps). Bookable cells:
 * `a.book-interval.not-booked` (link text is usually price, not times). Booked: `a.edit-booking`.
 */
export function bookingSlotRow(sessionDate: string): LocatorSpec {
  return { kind: "css", selector: `[data-test-id*="|${sessionDate}|"]` };
}

// --- Payment: Stripe Elements (inside iframes) ---

/**
 * Host-page hints from codegen (optional — use if fills are flaky without a focus click).
 * Do not store card data in code; adapter fills at runtime only.
 */
export const PAYMENT_HOST = {
  cardNumberLabel: { kind: "text", text: "Card number" } as const,
  expiryLabel: { kind: "text", text: "MM/YY" } as const,
  cvcLabel: { kind: "text", text: "CVC" } as const,
};

/** Accessible names **inside** Stripe iframes — stable across sessions (Stripe-controlled). */
export const STRIPE_INNER_FIELD = {
  cardNumber: { role: "textbox" as const, name: "Credit or debit card number" as const },
  expiry: { role: "textbox" as const, name: "Credit or debit card expiry" as const },
  cvc: { role: "textbox" as const, name: "Credit or debit card CVC/CVV" as const },
};

/**
 * Locate each card iframe without using dynamic names like `__privateStripeFrame7753`
 * (the numeric suffix changes every page load).
 *
 * Wrapper ids follow the pattern seen on the host page (`#cs-stripe-elements-card-cvc` in codegen).
 * **Verify** `card-number` / `card-expiry` wrapper ids in DevTools; if they differ, update selectors here.
 *
 * Adapter pattern:
 * `page.locator(selector).contentFrame().getByRole(inner.role, { name: inner.name })`
 * or `page.frameLocator(selector).getByRole(...)`.
 */
export const STRIPE_CARD_FRAMES = {
  cardNumber: {
    iframe: { kind: "css", selector: '#cs-stripe-elements-card-number iframe[allow="payment *"]' } as const,
    inner: STRIPE_INNER_FIELD.cardNumber,
  },
  expiry: {
    iframe: { kind: "css", selector: '#cs-stripe-elements-card-expiry iframe[allow="payment *"]' } as const,
    inner: STRIPE_INNER_FIELD.expiry,
  },
  cvc: {
    iframe: { kind: "css", selector: '#cs-stripe-elements-card-cvc iframe[allow="payment *"]' } as const,
    inner: STRIPE_INNER_FIELD.cvc,
  },
} as const;

/**
 * Final charge button on Stripe step. Amount varies → match prefix `Pay $`.
 * Codegen: `getByRole('button', { name: 'Pay $' })`.
 */
export const PAYMENT_SUBMIT = {
  pay: { kind: "role", role: "button", name: /Pay \$/ } as const,
};

/**
 * Legacy flat map for docs / adapters that expect `PAYMENT.*` keys.
 * Card fields are **not** `LocatorSpec` on the root page — use `STRIPE_CARD_FRAMES` + `frameLocator`.
 */
export const PAYMENT = {
  host: PAYMENT_HOST,
  stripeFrames: STRIPE_CARD_FRAMES,
  submit: PAYMENT_SUBMIT.pay,
} as const;

/** If the checkout adds name / postcode **outside** the Stripe iframes, codegen again and append here. */
export const PAYMENT_OUTER_OPTIONAL = {
  nameOnCard: { kind: "label", text: "REPLACE_IF_PRESENT" },
  postcode: { kind: "label", text: "REPLACE_IF_PRESENT" },
} as const;

// --- After pay: booking confirmation page ---

/**
 * After **Pay**, Clubspark redirects to a URL like:
 * `/CaberParkTennisCourts/Booking/BookingConfirmation/{bookingId}`.
 * Do **not** hardcode the UUID — wait for navigation, e.g.
 * `page.waitForURL(BOOKING_CONFIRMATION.urlPathRegex)` (same origin as booking site).
 */
export const BOOKING_CONFIRMATION = {
  urlPathRegex: /\/CaberParkTennisCourts\/Booking\/BookingConfirmation\/[0-9a-f-]+/i,
} as const;

/**
 * Confirmation UI (from codegen). Month and court lines are dynamic — use regex / `confirmationCourtLine`.
 */
export const CONFIRMATION = {
  /**
   * Primary success heading; accessible name may continue after this phrase
   * (e.g. “Your booking has been confirmed”).
   */
  successHeading: { kind: "role", role: "heading", name: /Your booking has been/i } as const,
  /**
   * Month summary heading (codegen: “May 2026”). Matches `Month YYYY` in English.
   */
  calendarMonthHeading: { kind: "role", role: "heading", name: /^[A-Za-z]+ \d{4}$/ } as const,
  /** Section heading above the gate PIN card (“Your pin code”). */
  yourPinCodeHeading: { kind: "role", role: "heading", name: "Your pin code" } as const,
  /** Static label above the court line in the PIN card (“Gate Pin code”). */
  gatePinLabel: { kind: "text", text: "Gate Pin code" } as const,
} as const;

/**
 * Locator for the **court + PIN** line on the confirmation page. UI shows one string like `Court 3: 0782`.
 * Equivalent to `page.getByText('Court 3:')` (substring match); use this with **dynamic** court number.
 *
 * Adapter: resolve to `page.getByText(new RegExp(...))` from the returned `LocatorSpec`, then
 * `innerText()` and {@link parseGatePinFromCourtRow} to store the PIN in the ledger.
 */
export function confirmationCourtLine(courtNumber: number): LocatorSpec {
  return { kind: "text", text: new RegExp(`Court\\s*${courtNumber}\\s*:`, "i") };
}

/**
 * Extract digits after `Court n:` from the row text (e.g. `Court 3: 0782` → `0782`).
 * Matches **any** `Court N:` row — use {@link extractCourtPinFromText} when the text may
 * contain multiple court lines and you need a specific one.
 */
export function parseGatePinFromCourtRow(text: string): string | null {
  const m = text.trim().match(/Court\s*\d+\s*:\s*(\d+)/i);
  return m?.[1] ?? null;
}

/**
 * Extract the gate PIN for a specific court number from a block of confirmation-page text
 * (typically the full `innerText` of `.pin-code-item-container`). The `\b` word boundary
 * and post-number lookahead prevent `Court 1` from matching inside `Court 10`/`Court 11`
 * when the basket contains multiple courts.
 */
export function extractCourtPinFromText(text: string, courtNumber: number): string | null {
  const pattern = new RegExp(`\\bCourt\\s*${courtNumber}\\s*:\\s*(\\d+)`, "i");
  const m = text.match(pattern);
  return m?.[1] ?? null;
}
