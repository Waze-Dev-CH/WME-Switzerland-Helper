import { describe, expect, it } from "vitest";
import type { Snapshot } from "../controller";
import type { Assignment } from "../assign";
import type { GwrPoint } from "../gwr/types";
import { IMPORT_CAP } from "../import";
import type { StatusedPoint } from "../status";
import { canBulkImport, countByStatus, formatImportButton, formatState } from "./format";

const at = (p: GwrPoint): Assignment => ({ point: p, segmentId: 1, distanceM: 0 });

const point = (number: string): GwrPoint => ({
  id: `p-${number}`,
  number,
  streetNames: ["Rue Exemple"],
  esid: 1,
  lon: 6.6,
  lat: 46.5,
  officialAddress: true,
});

const statused = (number: string, status: StatusedPoint["status"]): StatusedPoint => ({
  point: point(number),
  status,
});

const snapshot = (overrides: Partial<Snapshot> = {}): Snapshot => ({
  state: "idle",
  points: [],
  segmentId: 1,
  streetName: "Rue Exemple",
  missing: [],
  truncated: false,
  progress: null,
  error: null,
  ...overrides,
});

describe("formatState", () => {
  it("shows the tile progress while fetching", () => {
    const text = formatState(snapshot({ state: "fetching", progress: { done: 2, total: 5 } }));
    expect(text).toContain("2");
    expect(text).toContain("5");
  });

  it("carries the error message", () => {
    expect(formatState(snapshot({ state: "error", error: "boom" }))).toContain("boom");
  });

  it("names the gated states", () => {
    expect(formatState(snapshot({ state: "zoom-gated" }))).toMatch(/zoom/i);
    expect(formatState(snapshot({ state: "outside-ch" }))).toMatch(/switzerland/i);
  });
});

describe("countByStatus", () => {
  it("counts each status separately", () => {
    const counts = countByStatus([
      statused("2", "MISSING"),
      statused("4", "MISSING"),
      statused("6", "PRESENT"),
      statused("8", "OTHER_STREET"),
      statused("10", "NEUTRAL"),
    ]);
    expect(counts).toEqual({ total: 5, missing: 2, present: 1, otherStreet: 1 });
  });
});

describe("formatImportButton", () => {
  it("announces the plain count below the cap", () => {
    const label = formatImportButton(12);
    expect(label).toContain("12");
    expect(label).not.toContain(String(IMPORT_CAP));
  });

  it("announces both numbers above the cap, so the editor knows a second run is needed", () => {
    const label = formatImportButton(137);
    expect(label).toContain(String(IMPORT_CAP));
    expect(label).toContain("137");
  });
});

describe("canBulkImport", () => {
  it("allows it with a selection and something missing", () => {
    expect(canBulkImport(snapshot({ missing: [at(point("2"))] }))).toBe(true);
  });

  it("refuses without a selection", () => {
    expect(canBulkImport(snapshot({ segmentId: null, missing: [at(point("2"))] }))).toBe(false);
  });

  it("refuses when nothing is missing", () => {
    expect(canBulkImport(snapshot({ missing: [] }))).toBe(false);
  });

  it("refuses on a truncated tile, whose count cannot be trusted", () => {
    // "N missing" would be a lower bound, and the button would promise a completeness the
    // data does not have.
    expect(canBulkImport(snapshot({ truncated: true, missing: [at(point("2"))] }))).toBe(false);
  });
});
