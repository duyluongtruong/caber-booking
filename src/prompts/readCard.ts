import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import type { CardPaymentInput } from "../adapters/clubspark/pay.js";

/**
 * Resolve `config/card.local.json` path. Honour `TENNIS_BOOKING_CARD` (mirrors the
 * `TENNIS_BOOKING_ACCOUNTS` / `TENNIS_BOOKING_LEDGER` convention) so operators can
 * keep card data anywhere without leaking the path into git.
 */
export function resolveCardConfigPath(): string {
  const fromEnv = process.env.TENNIS_BOOKING_CARD;
  if (fromEnv !== undefined && fromEnv.length > 0) {
    return path.isAbsolute(fromEnv) ? fromEnv : path.resolve(process.cwd(), fromEnv);
  }
  return path.join(process.cwd(), "config", "card.local.json");
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function nonEmptyString(v: unknown, field: string, ctx: string): string {
  if (typeof v !== "string" || v.trim().length === 0) {
    throw new Error(`${ctx}: ${field} must be a non-empty string`);
  }
  return v.trim();
}

/** Validate and parse `{ cardNumber, expiry, cvc }` from a JSON file. */
export function loadCardFromFile(filePath: string): CardPaymentInput {
  const ctx = `card config (${filePath})`;
  let rawText: string;
  try {
    rawText = readFileSync(filePath, "utf8");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`${ctx}: cannot read file — ${msg}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText) as unknown;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`${ctx}: invalid JSON — ${msg}`);
  }

  if (!isObject(parsed)) {
    throw new Error(`${ctx}: top-level must be an object with cardNumber/expiry/cvc`);
  }

  return {
    cardNumber: nonEmptyString(parsed.cardNumber, "cardNumber", ctx),
    expiry: nonEmptyString(parsed.expiry, "expiry", ctx),
    cvc: nonEmptyString(parsed.cvc, "cvc", ctx),
  };
}

/** Fallback: prompt operator interactively for card details. */
export async function readCardFromStdin(): Promise<CardPaymentInput> {
  const rl = readline.createInterface({ input, output });
  try {
    const cardNumber = (await rl.question("Card number: ")).trim();
    const expiry = (await rl.question("Expiry (MM/YY): ")).trim();
    const cvc = (await rl.question("CVC: ")).trim();
    if (!cardNumber || !expiry || !cvc) {
      throw new Error("Card number, expiry, and CVC are required");
    }
    return { cardNumber, expiry, cvc };
  } finally {
    rl.close();
  }
}

/**
 * Prefer `config/card.local.json` (or `TENNIS_BOOKING_CARD`) when present; otherwise
 * fall back to interactive stdin prompts. Emits a diagnostic line so operators can see
 * which path was used without revealing card values.
 */
export async function getCardInput(): Promise<CardPaymentInput> {
  const filePath = resolveCardConfigPath();
  if (existsSync(filePath)) {
    console.error(`card: loading from ${filePath}`);
    return loadCardFromFile(filePath);
  }
  console.error("card: no local card file — prompting for details (not logged).");
  return readCardFromStdin();
}
