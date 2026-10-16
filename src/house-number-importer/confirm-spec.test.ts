import { describe, expect, it, vi } from "vitest";
import { massImportSpec, singleImportSpec } from "./confirm-spec";

const facts = (spec: { facts: string[] }) => spec.facts.join("\n");

const mass = (overrides: Partial<Parameters<typeof massImportSpec>[0]> = {}) =>
  massImportSpec({
    count: 3,
    street: "Rue Exemple",
    numbers: "2, 4, 6",
    segments: 1,
    unverifiedName: false,
    ...overrides,
  });

describe("singleImportSpec", () => {
  it("names the number and street, says nothing is saved and offers the skip box", () => {
    const onSkip = vi.fn();
    const spec = singleImportSpec("15", "Rue Exemple", onSkip);

    expect(spec.title).toContain("15");
    expect(`${spec.title}\n${facts(spec)}`).toContain("Rue Exemple");
    expect(facts(spec)).toContain("saved automatically");
    expect(spec.skip?.isSkipped).toBe(false);
    spec.skip?.remember();
    expect(onSkip).toHaveBeenCalledTimes(1);
  });
});

describe("massImportSpec", () => {
  it("lists the numbers in the note, states the change and never offers a skip", () => {
    const spec = mass();

    expect(spec.title).toContain("3");
    expect(spec.title).toContain("Rue Exemple");
    expect(spec.note).toContain("2, 4, 6");
    expect(facts(spec)).toContain("saved automatically");
    expect(facts(spec)).toContain("the changes go to your pending edits");
    expect(facts(spec)).toMatch(/check the result/i);
    expect(spec.skip).toBeUndefined();
  });

  it("states the cap and the total when the batch is capped", () => {
    const spec = mass({ count: 50, cap: 50, total: 57 });
    const text = `${spec.title}\n${facts(spec)}`;

    expect(text).toContain("50");
    expect(text).toContain("57");
  });

  it("mentions the segment spread only when there is more than one", () => {
    expect(facts(mass({ segments: 1 }))).not.toMatch(/WME segments/);
    expect(facts(mass({ segments: 4 }))).toContain("4");
  });

  it("carries the unverified-name warning only when asked", () => {
    expect(mass().warning).toBeUndefined();
    expect(mass({ unverifiedName: true }).warning).toMatch(/street-name checker/i);
  });
});
