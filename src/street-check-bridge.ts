/**
 * One-way channel from the street-name checker to whoever wants to know whether a
 * segment's name matches the official register.
 *
 * Deliberately question-shaped rather than object-shaped: the checker publishes a function,
 * not its Scanner. The consumer cannot pause a scan or reach another feature's settings,
 * and it never has to reimplement the checker's invariants, which are subtle (see the
 * provider in street-name-checker/index.ts). Neither feature imports the other; both know
 * only this file, which depends on nothing.
 *
 * Degradation is free: with no provider registered, every answer is "unknown", so a
 * consumer written against this API behaves correctly when the checker is switched off,
 * still starting up, or absent from the build.
 */

export type StreetNameVerdict =
  /** The name matches the official register. */
  | { kind: "conform" }
  /** The name differs; `suggestion` is the official form when there is one. */
  | { kind: "mismatch"; status: string; suggestion: string | null }
  /** Not checked: feature off, area not scanned, segment out of scope, scan in flight. */
  | { kind: "unknown" };

export type StreetNameProvider = (segmentId: number) => StreetNameVerdict;

let provider: StreetNameProvider | null = null;

export function registerStreetNameProvider(next: StreetNameProvider): void {
  provider = next;
}

export function getStreetNameVerdict(segmentId: number): StreetNameVerdict {
  if (!provider) return { kind: "unknown" };
  try {
    return provider(segmentId);
  } catch {
    // A consumer must never break because the other feature threw.
    return { kind: "unknown" };
  }
}

/** Test seam: drops the registered provider. */
export function resetStreetNameProvider(): void {
  provider = null;
}
