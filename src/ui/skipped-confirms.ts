import type { SkipOption } from "./dialog";

/**
 * The "don't show again" choices, persisted per browser.
 *
 * Every read goes to storage: two WME tabs share one localStorage, and a choice made in
 * one must hold in the other without a reload. Storage may be missing or blocked, so
 * every failure reads as "nothing skipped" and never reaches the caller.
 */

export type SkipScope = "chk" | "scu" | "pt";

const STORE_KEY = "wme-ch-helper.skipped-confirms";

function readIds(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORE_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === "string");
  } catch {
    return [];
  }
}

function writeIds(ids: string[]): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(ids));
  } catch {
    // Nothing to fall back on: the popup simply keeps appearing.
  }
}

export function isConfirmSkipped(id: string): boolean {
  return readIds().includes(id);
}

export function rememberSkip(id: string): void {
  const ids = readIds();
  if (ids.includes(id)) return;
  writeIds([...ids, id]);
}

export function hasSkipped(scope: SkipScope): boolean {
  return readIds().some((id) => id.startsWith(`${scope}.`));
}

export function clearSkipped(scope: SkipScope): void {
  writeIds(readIds().filter((id) => !id.startsWith(`${scope}.`)));
}

/** id is "<scope>.<name>"; isSkipped is read now, remember writes later. */
export function skipOption(id: string, label: string): SkipOption {
  return {
    label,
    isSkipped: isConfirmSkipped(id),
    remember: () => rememberSkip(id),
  };
}
