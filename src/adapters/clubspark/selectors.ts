/**
 * Clubspark / Caber Park UI selectors.
 *
 * Fill these from `docs/superpowers/notes/clubspark-ui-spike.md` after running:
 *   npm run codegen
 *
 * Do not guess production selectors — use codegen + spike notes.
 */

export const CABER_PARK_BOOKING_BASE =
  "https://play.tennis.com.au/CaberParkTennisCourts/Booking/BookByDate";

/** Build booking URL with optional date (YYYY-MM-DD) and role. */
export function bookingUrl(opts?: { date?: string; role?: "guest" | "member" }) {
  const params = new URLSearchParams();
  if (opts?.date) params.set("date", opts.date);
  if (opts?.role) params.set("role", opts.role);
  const hash = params.toString() ? `#?${params.toString()}` : "";
  return `${CABER_PARK_BOOKING_BASE}${hash}`;
}

// --- Sign-in (replace TODOs after spike) ---

export const SIGN_IN = {
  /** e.g. link or button to open auth */
  entry: "TODO",
  username: "TODO",
  password: "TODO",
  submit: "TODO",
} as const;

// --- Date / court / slot (replace after spike) ---

export const BOOKING_FLOW = {
  datePicker: "TODO",
  courtCell: "TODO",
  timeSlot: "TODO",
  addOrContinue: "TODO",
} as const;

// --- Checkout (replace after spike) ---

export const PAYMENT = {
  cardNumber: "TODO",
  expiry: "TODO",
  cvv: "TODO",
  nameOnCard: "TODO",
  postcode: "TODO",
  submit: "TODO",
} as const;

// --- Post-payment (replace after spike) ---

export const CONFIRMATION = {
  /** Container or text locator for success */
  successMarker: "TODO",
  /** PIN / access code if shown on page */
  accessCode: "TODO",
} as const;
