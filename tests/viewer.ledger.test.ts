import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchLedger, LedgerLoadError } from "../src/viewer/ledger.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_TEXT = readFileSync(
  path.join(HERE, "fixtures/ledger.viewer.sample.json"),
  "utf8",
);

type FetchImpl = typeof globalThis.fetch;

function withFetch<T>(impl: FetchImpl, fn: () => Promise<T>): Promise<T> {
  const real = globalThis.fetch;
  globalThis.fetch = impl;
  return fn().finally(() => {
    globalThis.fetch = real;
  });
}

test("fetchLedger: 200 + valid JSON + valid shape → resolves LedgerFile", async () => {
  await withFetch(
    async () => new Response(FIXTURE_TEXT, { status: 200 }),
    async () => {
      const file = await fetchLedger();
      assert.equal(typeof file.sessions, "object");
      assert.ok(file.sessions["2099-01-01"]);
    },
  );
});

test("fetchLedger: 404 → throws LedgerLoadError(missing)", async () => {
  await withFetch(
    async () => new Response("not found", { status: 404 }),
    async () => {
      await assert.rejects(
        () => fetchLedger(),
        (e) => e instanceof LedgerLoadError && e.kind === "missing",
      );
    },
  );
});

test("fetchLedger: 500 → throws LedgerLoadError(network)", async () => {
  await withFetch(
    async () => new Response("boom", { status: 500 }),
    async () => {
      await assert.rejects(
        () => fetchLedger(),
        (e) => e instanceof LedgerLoadError && e.kind === "network",
      );
    },
  );
});

test("fetchLedger: network throw → LedgerLoadError(network)", async () => {
  await withFetch(
    async () => {
      throw new Error("offline");
    },
    async () => {
      await assert.rejects(
        () => fetchLedger(),
        (e) => e instanceof LedgerLoadError && e.kind === "network",
      );
    },
  );
});

test("fetchLedger: invalid JSON body → LedgerLoadError(parse)", async () => {
  await withFetch(
    async () => new Response("{not json", { status: 200 }),
    async () => {
      await assert.rejects(
        () => fetchLedger(),
        (e) => e instanceof LedgerLoadError && e.kind === "parse",
      );
    },
  );
});

test("fetchLedger: valid JSON, wrong shape → LedgerLoadError(shape)", async () => {
  await withFetch(
    async () => new Response(JSON.stringify({ sessions: "nope" }), { status: 200 }),
    async () => {
      await assert.rejects(
        () => fetchLedger(),
        (e) => e instanceof LedgerLoadError && e.kind === "shape",
      );
    },
  );
});
