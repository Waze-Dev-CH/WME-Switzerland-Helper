import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  groupRenameSpec,
  ignoreAllSpec,
  overLockSpec,
  wrongStreetSpec,
} from "./confirm-spec";

const facts = (spec: { facts: string[] }) => spec.facts.join("\n");

describe("checker confirm specs", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: () => undefined,
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("overLockSpec names the target lock and the segment count", () => {
    const spec = overLockSpec(2, 7);
    expect(spec.title).toContain("L2");
    expect(facts(spec)).toContain("7");
    expect(facts(spec)).toContain("saved automatically");
    expect(spec.skip).toBeUndefined();
  });

  it("wrongStreetSpec states the change, the confidence and the geometry warning", () => {
    const spec = wrongStreetSpec(
      "Chemin de la Poste",
      "Route de la Guerite",
      0.8,
      3,
    );
    expect(facts(spec)).toContain("Chemin de la Poste");
    expect(facts(spec)).toContain("Route de la Guerite");
    expect(facts(spec)).toContain("saved automatically");
    expect(spec.note).toContain("80");
    expect(spec.warning).toContain("geometry");
    expect(spec.skip).toBeUndefined();
  });

  it("wrongStreetSpec has no note when the figures are unknown", () => {
    expect(wrongStreetSpec("A", "B").note).toBeUndefined();
  });

  it("groupRenameSpec states count and both names", () => {
    const spec = groupRenameSpec(12, "Av. X", "Avenue X");
    expect(spec.title).toContain("12");
    expect(facts(spec)).toContain("Av. X");
    expect(facts(spec)).toContain("Avenue X");
    expect(facts(spec)).toContain("saved automatically");
    expect(spec.skip).toBeUndefined();
  });

  it("only ignoreAllSpec offers to skip, under the chk.ignoreAll id", () => {
    const spec = ignoreAllSpec(30);
    expect(spec.title).toContain("30");
    expect(facts(spec)).toContain("saved");
    expect(spec.skip?.isSkipped).toBe(false);
    expect(spec.skip?.label).toBeTruthy();
  });
});
