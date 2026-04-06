import type { Locator, Page } from "playwright";
import type { LocatorSpec } from "./selectors.js";

export function locatorFromSpec(page: Page, spec: LocatorSpec): Locator {
  switch (spec.kind) {
    case "role":
      return page.getByRole(spec.role, { name: spec.name });
    case "label":
      return page.getByLabel(spec.text);
    case "placeholder":
      return page.getByPlaceholder(spec.text);
    case "text":
      return page.getByText(spec.text);
    case "testId":
      return page.getByTestId(spec.id);
    case "title":
      return page.getByTitle(spec.text);
    case "css":
      return page.locator(spec.selector);
    default:
      throw new Error(`Unhandled LocatorSpec: ${JSON.stringify(spec)}`);
  }
}
