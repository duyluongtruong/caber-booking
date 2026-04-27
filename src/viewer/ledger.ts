import type { LedgerFile } from "../ledger/types.js";
import { isLedgerFile } from "../ledger/validate.js";

export type LedgerLoadKind = "missing" | "parse" | "shape" | "network";

export class LedgerLoadError extends Error {
  constructor(public readonly kind: LedgerLoadKind, message: string) {
    super(message);
    this.name = "LedgerLoadError";
  }
}

export async function fetchLedger(url: string = "./ledger.json"): Promise<LedgerFile> {
  let res: Response;
  try {
    res = await fetch(url, { cache: "no-cache" });
  } catch (e) {
    throw new LedgerLoadError("network", e instanceof Error ? e.message : String(e));
  }

  if (res.status === 404) {
    throw new LedgerLoadError("missing", "ledger.json not found");
  }
  if (!res.ok) {
    throw new LedgerLoadError("network", `HTTP ${res.status}`);
  }

  let raw: unknown;
  try {
    raw = await res.json();
  } catch (e) {
    throw new LedgerLoadError("parse", e instanceof Error ? e.message : String(e));
  }

  if (!isLedgerFile(raw)) {
    throw new LedgerLoadError("shape", "ledger.json does not match expected shape");
  }

  return raw;
}
