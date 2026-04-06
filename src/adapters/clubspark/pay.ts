import type { Page } from "playwright";
import {
  BOOKING_CONFIRMATION,
  PAYMENT_HOST,
  PAYMENT_SUBMIT,
  STRIPE_CARD_FRAMES,
} from "./selectors.js";
import { locatorFromSpec } from "./locator.js";

export type CardPaymentInput = {
  cardNumber: string;
  expiry: string;
  cvc: string;
};

function stripeTextbox(
  page: Page,
  frame: { iframe: { kind: "css"; selector: string }; inner: { role: "textbox"; name: string } },
) {
  if (frame.iframe.kind !== "css") throw new Error("Stripe frame expects css iframe selector");
  return page.frameLocator(frame.iframe.selector).getByRole("textbox", { name: frame.inner.name });
}

/** Optional focus clicks on host labels (helps some Stripe layouts). */
async function optionalHostFocus(page: Page): Promise<void> {
  for (const spec of [PAYMENT_HOST.cardNumberLabel, PAYMENT_HOST.expiryLabel, PAYMENT_HOST.cvcLabel]) {
    try {
      await locatorFromSpec(page, spec).click({ timeout: 2000 });
    } catch {
      /* ignore */
    }
  }
}

/**
 * Assumes payment view is open (after “Confirm and pay”). Fills Stripe iframes and submits.
 * Does not persist card data; caller should discard `card` after await.
 */
export async function payWithCard(page: Page, card: CardPaymentInput): Promise<void> {
  await optionalHostFocus(page);

  await stripeTextbox(page, STRIPE_CARD_FRAMES.cardNumber).fill(card.cardNumber);
  await stripeTextbox(page, STRIPE_CARD_FRAMES.expiry).fill(card.expiry);
  await stripeTextbox(page, STRIPE_CARD_FRAMES.cvc).fill(card.cvc);

  await locatorFromSpec(page, PAYMENT_SUBMIT.pay).click();

  await page.waitForURL(BOOKING_CONFIRMATION.urlPathRegex, { timeout: 120_000 });

  card.cardNumber = "";
  card.expiry = "";
  card.cvc = "";
}
