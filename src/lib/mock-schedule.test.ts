import { describe, expect, it } from "vitest";
import { getMockEntryState } from "./mock-schedule";

describe("getMockEntryState", () => {
  const now = new Date("2026-08-15T12:00:00Z");

  it("is unscheduled for a free mock even with startsAt/endsAt set", () => {
    expect(getMockEntryState({ price: 0, startsAt: "2026-08-15T10:00:00Z", endsAt: "2026-08-15T14:00:00Z", hasExistingResult: false, now })).toBe("unscheduled");
  });

  it("is unscheduled for a paid mock with no startsAt", () => {
    expect(getMockEntryState({ price: 50000, startsAt: null, endsAt: "2026-08-15T14:00:00Z", hasExistingResult: false, now })).toBe("unscheduled");
  });

  it("is unscheduled for a paid mock with startsAt but no endsAt", () => {
    expect(getMockEntryState({ price: 50000, startsAt: "2026-08-15T10:00:00Z", endsAt: null, hasExistingResult: false, now })).toBe("unscheduled");
  });

  it("is not_open_yet before startsAt", () => {
    expect(getMockEntryState({ price: 50000, startsAt: "2026-08-15T13:00:00Z", endsAt: "2026-08-16T13:00:00Z", hasExistingResult: false, now })).toBe("not_open_yet");
  });

  it("is open right at startsAt", () => {
    expect(getMockEntryState({ price: 50000, startsAt: "2026-08-15T12:00:00Z", endsAt: "2026-08-15T23:59:00Z", hasExistingResult: false, now })).toBe("open");
  });

  it("is open within a manually chosen multi-day window", () => {
    expect(getMockEntryState({ price: 50000, startsAt: "2026-08-14T09:00:00Z", endsAt: "2026-08-17T23:59:00Z", hasExistingResult: false, now })).toBe("open");
  });

  it("is closed once the manual end time has passed", () => {
    expect(getMockEntryState({ price: 50000, startsAt: "2026-08-13T09:00:00Z", endsAt: "2026-08-15T11:00:00Z", hasExistingResult: false, now })).toBe("closed");
  });

  it("stays open past the close time if a result already exists (viewing/retake of an already-taken attempt)", () => {
    expect(getMockEntryState({ price: 50000, startsAt: "2026-08-13T09:00:00Z", endsAt: "2026-08-15T11:00:00Z", hasExistingResult: true, now })).toBe("open");
  });
});
