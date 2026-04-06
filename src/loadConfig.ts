import { readFileSync } from "node:fs";
import path from "node:path";
import type { BookingAccount } from "./planner/types.js";

export type ConfigAccount = BookingAccount & { username: string; password: string };

export type LoadedConfig = {
  venueBaseUrl?: string;
  defaultSessionStart?: string;
  defaultSessionEnd?: string;
  accounts: ConfigAccount[];
};

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function nonEmptyString(v: unknown, field: string, ctx: string): string {
  if (typeof v !== "string" || v.length === 0) {
    throw new Error(`${ctx}: ${field} must be a non-empty string`);
  }
  return v;
}

export function resolveConfigPath(): string {
  const fromEnv = process.env.TENNIS_BOOKING_ACCOUNTS;
  if (fromEnv !== undefined && fromEnv.length > 0) {
    return path.isAbsolute(fromEnv) ? fromEnv : path.resolve(process.cwd(), fromEnv);
  }
  return path.join(process.cwd(), "config", "accounts.local.json");
}

export function loadConfig(filePath: string): LoadedConfig {
  const rawText = readFileSync(filePath, "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText) as unknown;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Invalid JSON in config file ${filePath}: ${msg}`);
  }

  if (!isObject(parsed)) {
    throw new Error("Config root must be a JSON object");
  }

  const accountsRaw = parsed.accounts;
  if (!Array.isArray(accountsRaw) || accountsRaw.length === 0) {
    throw new Error('Config "accounts" must be a non-empty array');
  }

  const venueBaseUrl =
    parsed.venueBaseUrl === undefined
      ? undefined
      : nonEmptyString(parsed.venueBaseUrl, "venueBaseUrl", "Config");
  const defaultSessionStart =
    parsed.defaultSessionStart === undefined
      ? undefined
      : nonEmptyString(parsed.defaultSessionStart, "defaultSessionStart", "Config");
  const defaultSessionEnd =
    parsed.defaultSessionEnd === undefined
      ? undefined
      : nonEmptyString(parsed.defaultSessionEnd, "defaultSessionEnd", "Config");

  const accounts: ConfigAccount[] = [];

  for (let i = 0; i < accountsRaw.length; i++) {
    const entry = accountsRaw[i];
    const ctx = `accounts[${i}]`;
    if (!isObject(entry)) {
      throw new Error(`${ctx} must be an object`);
    }

    const active = entry.active !== false;

    if (!active) {
      continue;
    }

    const id = nonEmptyString(entry.id, "id", ctx);
    const label = nonEmptyString(entry.label, "label", ctx);
    const username = nonEmptyString(entry.username, "username", ctx);
    const password = nonEmptyString(entry.password, "password", ctx);

    let maxBookingsPerDay: number | undefined;
    if (entry.maxBookingsPerDay !== undefined) {
      if (typeof entry.maxBookingsPerDay !== "number" || !Number.isFinite(entry.maxBookingsPerDay)) {
        throw new Error(`${ctx}: maxBookingsPerDay must be a finite number when set`);
      }
      maxBookingsPerDay = entry.maxBookingsPerDay;
    }

    const acc: ConfigAccount = {
      id,
      label,
      username,
      password,
      active: true,
      ...(maxBookingsPerDay !== undefined ? { maxBookingsPerDay } : {}),
    };
    accounts.push(acc);
  }

  if (accounts.length === 0) {
    throw new Error("No active accounts in config (every entry has active: false or array is empty)");
  }

  return {
    ...(venueBaseUrl !== undefined ? { venueBaseUrl } : {}),
    ...(defaultSessionStart !== undefined ? { defaultSessionStart } : {}),
    ...(defaultSessionEnd !== undefined ? { defaultSessionEnd } : {}),
    accounts,
  };
}
