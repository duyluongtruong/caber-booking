import test from "node:test";
import assert from "node:assert/strict";
import {
  bookingClockWindowAppearsInText,
  extractGatePinFromManageBookingsBodyText,
  myBookingsPanelHeaderMatchesJob,
  normalizeHHmm,
  parseMyBookingsPanelHeader,
  segmentMatchesBooking,
} from "../src/adapters/clubspark/manageBookingsPin.ts";
import type { PlannedJob } from "../src/planner/types.ts";

function job(overrides: Partial<PlannedJob> = {}): PlannedJob {
  return {
    sequence: 1,
    accountId: "a1",
    courtLabel: "Court 1",
    start: "19:30",
    end: "21:00",
    sessionDate: "2026-05-04",
    ...overrides,
  };
}

test("parseMyBookingsPanelHeader parses Clubspark h2 line", () => {
  assert.deepEqual(parseMyBookingsPanelHeader("Mon, 27 Apr 2026, 19:30 - 22:00"), {
    sessionDate: "2026-04-27",
    start: "19:30",
    end: "22:00",
  });
});

test("myBookingsPanelHeaderMatchesJob matches on date + start only (h2 end can be longer than job)", () => {
  const h2 = "Mon, 27 Apr 2026, 19:30 - 22:00";
  assert.equal(
    myBookingsPanelHeaderMatchesJob(
      h2,
      job({ sessionDate: "2026-04-27", start: "19:30", end: "21:00" }),
    ),
    true,
  );
  assert.equal(
    myBookingsPanelHeaderMatchesJob(
      h2,
      job({ sessionDate: "2026-04-27", start: "19:00", end: "19:30" }),
    ),
    false,
  );
});

test("normalizeHHmm pads hours and minutes", () => {
  assert.equal(normalizeHHmm("9:5"), "09:05");
  assert.equal(normalizeHHmm("19:30"), "19:30");
});

test("bookingClockWindowAppearsInText requires full start–end pair", () => {
  const j = job({ start: "19:00", end: "19:30" });
  assert.equal(bookingClockWindowAppearsInText("Mon, 27 Apr 2026, 19:00 - 19:30", j), true);
  assert.equal(bookingClockWindowAppearsInText("Mon, 27 Apr 2026, 19:30 - 22:00", j), false);
  assert.equal(bookingClockWindowAppearsInText("19:30 and 19:00 - 19:30 mixed", j), true);
});

test("extractGatePinFromManageBookingsBodyText finds Court line + ISO date + clock window", () => {
  const body = `
Upcoming
2026-05-04
19:30 – 21:00
Court 1
Court 1: 0782
`.trim();
  assert.equal(extractGatePinFromManageBookingsBodyText(body, job()), "0782");
});

test("extractGatePinFromManageBookingsBodyText matches real Clubspark copy (short date + Gate Pin row)", () => {
  const body = `
Mon, 27 Apr 2026, 19:30 - 22:00
View details
Resource(s)
Court 1
Gate Pin:
0428
`.trim();
  assert.equal(
    extractGatePinFromManageBookingsBodyText(
      body,
      job({ sessionDate: "2026-04-27", start: "19:30", end: "22:00", courtLabel: "Court 1" }),
    ),
    "0428",
  );
});

test("extractGatePinFromManageBookingsBodyText finds Access code when clock window matches job", () => {
  const body = `
Monday, 4 May 2026
19:30 - 21:00
Court 1
Access code: 0782
`.trim();
  assert.equal(extractGatePinFromManageBookingsBodyText(body, job()), "0782");
});

test("extractGatePinFromManageBookingsBodyText returns null when court does not match", () => {
  const body = `
2026-05-04
19:30 – 21:00
Court 2
Court 2: 9999
`.trim();
  assert.equal(extractGatePinFromManageBookingsBodyText(body, job()), null);
});

test("does not attribute Court 2’s 19:00–19:30 PIN to a Court 1 job (regression)", () => {
  const twoPanels = `
Mon, 27 Apr 2026, 19:30 - 22:00
View details
Resource(s)
Court 1
Gate Pin:
1111

Mon, 27 Apr 2026, 19:00 - 19:30
View details
Resource(s)
Court 2
Gate Pin:
2222
`.trim();
  assert.equal(
    extractGatePinFromManageBookingsBodyText(
      twoPanels,
      job({ sessionDate: "2026-04-27", courtLabel: "Court 1", start: "19:00", end: "19:30" }),
    ),
    null,
  );
  assert.equal(
    extractGatePinFromManageBookingsBodyText(
      twoPanels,
      job({ sessionDate: "2026-04-27", courtLabel: "Court 2", start: "19:00", end: "19:30" }),
    ),
    "2222",
  );
});

test("segmentMatchesBooking requires court, full clock window, and date hints", () => {
  assert.equal(segmentMatchesBooking("Court 1\n2026-05-04\n19:30 - 21:00", job()), true);
  assert.equal(segmentMatchesBooking("Court 1\n2026-05-04\n19:30", job()), false);
  assert.equal(segmentMatchesBooking("Court 1\n2026-05-04", job({ start: "08:00", end: "09:00" })), false);
});
