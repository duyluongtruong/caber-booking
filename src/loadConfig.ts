import { readFileSync } from "node:fs";
import path from "node:path";
import type { BookingAccount } from "./planner/types.js";
import {
  DEFAULT_VENUE_SLUG,
  buildVenueContext,
  extractVenueSlugFromBookingBaseUrl,
  type VenueContext,
} from "./adapters/clubspark/selectors.js";

export type ConfigAccount = BookingAccount & { username: string; password: string };

export type LoadedConfig = {
  venueBaseUrl?: string;
  venueSlug?: string;
  /** Resolved per-venue URLs, derived from `venueSlug` (or extracted from `venueBaseUrl`). */
  venue: VenueContext;
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

/**
 * Resolve the active `VenueContext` for a single run.
 *
 * Precedence (highest first):
 *   1. `cliVenueSlug` (e.g. from `--venue <slug>`) — for one-off runs against a different venue.
 *   2. `cfg.venue` (built from `cfg.venueSlug` at config load time) — the persistent default.
 *
 * Empty/whitespace `cliVenueSlug` is ignored. Throws if an explicitly supplied slug is not
 * URL-safe. Accounts and other config are unaffected — only the venue URLs change.
 */
export function resolveVenueForRun(
  cfg: LoadedConfig,
  cliVenueSlug?: string | null,
): VenueContext {
  const override = typeof cliVenueSlug === "string" && cliVenueSlug.trim().length > 0
    ? cliVenueSlug.trim()
    : null;
  if (override === null) return cfg.venue;
  if (override === cfg.venue.slug) return cfg.venue;
  return buildVenueContext(override);
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
  const venueSlug =
    parsed.venueSlug === undefined
      ? undefined
      : nonEmptyString(parsed.venueSlug, "venueSlug", "Config");

  let resolvedSlug: string;
  if (venueSlug !== undefined) {
    resolvedSlug = venueSlug;
  } else if (venueBaseUrl !== undefined) {
    const extracted = extractVenueSlugFromBookingBaseUrl(venueBaseUrl);
    if (extracted === null) {
      console.error(
        `Config: could not extract venueSlug from venueBaseUrl "${venueBaseUrl}" — falling back to default "${DEFAULT_VENUE_SLUG}". Set "venueSlug" explicitly to silence this warning.`,
      );
      resolvedSlug = DEFAULT_VENUE_SLUG;
    } else {
      resolvedSlug = extracted;
    }
  } else {
    resolvedSlug = DEFAULT_VENUE_SLUG;
  }

  let venue: VenueContext;
  try {
    venue = buildVenueContext(resolvedSlug);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Config: invalid venueSlug "${resolvedSlug}": ${msg}`);
  }

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
    ...(venueSlug !== undefined ? { venueSlug } : {}),
    venue,
    ...(defaultSessionStart !== undefined ? { defaultSessionStart } : {}),
    ...(defaultSessionEnd !== undefined ? { defaultSessionEnd } : {}),
    accounts,
  };
}
