import type { WmeSDK } from "wme-sdk-typings";
import { getStreetNameVerdict } from "../street-check-bridge";
import { countSegments, distanceToSegmentM, type Assignment } from "./assign";
import type { GwrPoint } from "./gwr/types";
import { t } from "./i18n";
import { log } from "./log";
import { confirmDialog, notifyDialog, type Confirm, type Notify } from "./prompt";
import { compareHouseNumbers, normalizeNumber } from "./status";

/**
 * Most house numbers a single action may create.
 *
 * Enforced HERE rather than in the buttons: three surfaces trigger an import (the tab, the
 * edit-panel box and a shortcut), and a limit living in the UI is one missed check away
 * from being gone. `importPoints` slices to it whatever it is handed.
 */
export const IMPORT_CAP = 50;

/**
 * Beyond this, the address almost certainly belongs to another segment. The SDK does not
 * document what `addHouseNumber` does with a point far from the given segment, so this
 * guard does not depend on finding out.
 */
export const MAX_SNAP_DISTANCE_M = 150;

/** Confirmation is asked from this many numbers up; a single click is its own answer. */
export const CONFIRM_THRESHOLD = 2;

export type ImportError =
  | "errNotAllowed"
  | "errTooFar"
  | "errSegmentNotFound"
  | "errInvalidState"
  | "errUnknown";

export interface ImportOutcome {
  ok: boolean;
  pointId: string;
  number: string;
  error?: ImportError;
  /** Metres from the segment, when the failure was a distance one. */
  distance?: number;
}

function segmentGeometry(sdk: WmeSDK, segmentId: number): number[][] | null {
  try {
    return sdk.DataModel.Segments.getById({ segmentId })?.geometry.coordinates ?? null;
  } catch {
    return null;
  }
}

/**
 * Create one house number at the register's own coordinates, attached to the given segment.
 *
 * `segmentId` is always passed: without it the SDK picks the closest segment, which on a
 * corner building or a set-back house is regularly the cross street. Nothing is saved; the
 * edit lands on the WME undo stack.
 */
export function importPoint(sdk: WmeSDK, point: GwrPoint, segmentId: number): ImportOutcome {
  const base = { pointId: point.id, number: point.number };
  if (!sdk.Editing.isEditingAllowed()) return { ...base, ok: false, error: "errNotAllowed" };

  const coordinates = segmentGeometry(sdk, segmentId);
  if (!coordinates) return { ...base, ok: false, error: "errSegmentNotFound" };

  const distance = distanceToSegmentM(coordinates, point);
  if (distance > MAX_SNAP_DISTANCE_M) {
    return {
      ...base,
      ok: false,
      error: "errTooFar",
      distance: Math.round(distance),
    };
  }

  try {
    sdk.DataModel.HouseNumbers.addHouseNumber({
      number: point.number,
      point: { type: "Point", coordinates: [point.lon, point.lat] },
      segmentId,
    });
    return { ...base, ok: true };
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    if (name === "DataModelNotFoundError") {
      return { ...base, ok: false, error: "errSegmentNotFound" };
    }
    if (name === "InvalidStateError") return { ...base, ok: false, error: "errInvalidState" };
    log.warn(`Could not create house number ${point.number}`, err);
    return { ...base, ok: false, error: "errUnknown" };
  }
}

/**
 * Create up to IMPORT_CAP numbers, stopping at the first failure.
 *
 * Stopping rather than pressing on: whatever broke the first one (editing revoked, segment
 * unloaded) applies to the rest, and a half-applied batch reported as a success is worse
 * than a short one reported honestly.
 */
export async function importPoints(
  sdk: WmeSDK,
  assignments: Assignment[],
  onProgress?: (done: number, total: number) => void,
  alreadyPresent: ReadonlySet<string> = new Set(),
): Promise<ImportOutcome[]> {
  const batch = assignments.slice(0, IMPORT_CAP);
  const outcomes: ImportOutcome[] = [];
  // Numbers created during this very batch, so a list containing the same number twice
  // cannot produce two objects either.
  const created = new Set<string>();

  for (const [index, assignment] of batch.entries()) {
    const key = normalizeNumber(assignment.point.number);
    // Last line of defence against duplicates. The UI hides the button once everything is
    // imported, but its view of "what exists" can lag: fetchHouseNumbers is a server call
    // and does not see unsaved edits. Refusing here costs nothing and cannot be bypassed.
    if (alreadyPresent.has(key) || created.has(key)) {
      onProgress?.(index + 1, batch.length);
      continue;
    }
    const outcome = importPoint(sdk, assignment.point, assignment.segmentId);
    outcomes.push(outcome);
    onProgress?.(index + 1, batch.length);
    if (!outcome.ok) break;
    created.add(key);
    // Yield so progress actually paints and WME stays responsive on a long street.
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return outcomes;
}

let importInFlight = false;

export function isImportInFlight(): boolean {
  return importInFlight;
}

/**
 * Re-entrance guard shared by every import trigger (tab, edit-panel box, shortcut, map
 * click): while one batch runs, further clicks are ignored. Returns null when held.
 */
export async function withImportLock<T>(fn: () => Promise<T>): Promise<T | null> {
  if (importInFlight) return null;
  importInFlight = true;
  try {
    return await fn();
  } finally {
    importInFlight = false;
  }
}

export interface ImportUiHooks {
  confirm?: Confirm;
  notify?: Notify;
  /**
   * Called with what actually happened, never with what was asked for: the caller marks
   * numbers as created from this list, and a number that failed or fell past the cap would
   * otherwise be remembered as existing while nothing was ever created for it.
   */
  onComplete?: (outcomes: ImportOutcome[]) => void;
}

function describeFailure(outcome: ImportOutcome): string {
  if (outcome.error === "errTooFar") {
    return t("errTooFar", { distance: outcome.distance ?? 0 });
  }
  return t(outcome.error ?? "errUnknown");
}

/** Single click on a map point. Confirmation is opt-in: one object, instantly undoable. */
export async function runImportPoint(
  sdk: WmeSDK,
  point: GwrPoint,
  segmentId: number,
  streetName: string,
  options: { confirmSingle: boolean } & ImportUiHooks = {
    confirmSingle: false,
  },
): Promise<void> {
  const confirm = options.confirm ?? confirmDialog;
  const notify = options.notify ?? notifyDialog;

  await withImportLock(async () => {
    if (
      options.confirmSingle &&
      !(await confirm(t("confirmSingleImport", { number: point.number, street: streetName })))
    ) {
      return;
    }
    const outcome = importPoint(sdk, point, segmentId);
    if (!outcome.ok) await notify(describeFailure(outcome));
    options.onComplete?.([outcome]);
  });
}

/**
 * Bulk import with a mandatory recap. The message states the change (which numbers, which
 * street, that nothing is saved), not merely how many are affected.
 */
export async function runImportPoints(
  sdk: WmeSDK,
  assignments: Assignment[],
  selectedSegmentId: number,
  streetName: string,
  hooks: ImportUiHooks & { alreadyPresent?: ReadonlySet<string> } = {},
): Promise<void> {
  const confirm = hooks.confirm ?? confirmDialog;
  const notify = hooks.notify ?? notifyDialog;
  if (assignments.length === 0) return;

  await withImportLock(async () => {
    const batch = assignments.slice(0, IMPORT_CAP);
    const numbers = [...batch]
      .sort((a, b) => compareHouseNumbers(a.point.number, b.point.number))
      .map((assignment) => assignment.point.number)
      .join(", ");
    const capped = assignments.length > IMPORT_CAP;
    const base = capped
      ? t("confirmMassImportCapped", {
          cap: IMPORT_CAP,
          count: assignments.length,
          street: streetName,
          numbers,
        })
      : t("confirmMassImport", {
          count: batch.length,
          street: streetName,
          numbers,
        });

    // A street is several WME segments, and each number hangs from its own. Say so, or a
    // batch touching five segments looks like it only touched the selected one.
    const segments = countSegments(batch);
    const spread = segments > 1 ? `\n\n${t("confirmMassImportSegments", { segments })}` : "";

    // Creating forty numbers on a street that is about to be renamed is work done twice.
    // The checker's verdict is informative, not blocking: the register can lag reality.
    const verdict = getStreetNameVerdict(selectedSegmentId);
    const warning =
      verdict.kind === "mismatch" ? `\n\n${t("confirmMassImportUnverifiedName")}` : "";

    // The coordinates come from the register's entrance point, which is usually right but
    // not always: a courtyard entrance, a building set back from the road. Placing forty
    // numbers in one click should not read as "and they are all correct".
    const review = `\n\n${t("confirmMassImportReview")}`;

    if (
      batch.length >= CONFIRM_THRESHOLD &&
      !(await confirm(`${base}${spread}${warning}${review}`))
    ) {
      return;
    }

    const outcomes = await importPoints(sdk, assignments, undefined, hooks.alreadyPresent);
    const created = outcomes.filter((outcome) => outcome.ok).length;
    const failure = outcomes.find((outcome) => !outcome.ok);
    if (failure) {
      await notify(
        t("importStopped", {
          done: created,
          total: batch.length,
          message: describeFailure(failure),
        }),
      );
    } else {
      await notify(t("importedCount", { count: created }));
    }
    hooks.onComplete?.(outcomes);
  });
}
