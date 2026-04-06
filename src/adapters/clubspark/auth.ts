import type { Page } from "playwright";
import { SIGN_IN } from "./selectors.js";
import { locatorFromSpec } from "./locator.js";

/** Sign in on the current Clubspark booking page (sign-in link → email/password → submit). */
export async function login(page: Page, username: string, password: string): Promise<void> {
  await locatorFromSpec(page, SIGN_IN.entry).click();
  await locatorFromSpec(page, SIGN_IN.username).fill(username);
  await locatorFromSpec(page, SIGN_IN.password).fill(password);
  await locatorFromSpec(page, SIGN_IN.submit).click();
  await page.waitForLoadState("networkidle").catch(() => {});
}
