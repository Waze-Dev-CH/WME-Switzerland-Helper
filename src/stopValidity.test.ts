import { describe, it, expect } from "vitest";
import { isStopActive } from "./stopValidity";

describe("isStopActive", () => {
  it("is active when validTo is the open-ended sentinel", () => {
    expect(isStopActive("9999-12-31", "2026-06-10")).toBe(true);
  });

  it("is active when validTo is today (boundary)", () => {
    expect(isStopActive("2026-06-10", "2026-06-10")).toBe(true);
  });

  it("is inactive when validTo is before today", () => {
    expect(isStopActive("2026-06-09", "2026-06-10")).toBe(false);
  });
});
