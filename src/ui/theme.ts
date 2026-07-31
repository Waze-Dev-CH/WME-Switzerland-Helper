import { DARK_THEME_CLASS } from "./tokens";

/**
 * Follows WME's own skin rather than the OS preference, which can disagree with it.
 * Shared by every feature panel, so a skin switch flips them all at once.
 */

/**
 * Perceived-luminance verdict for a computed CSS colour.
 * Returns null when the colour is transparent or unreadable, so the caller keeps walking
 * up the ancestry instead of guessing.
 */
export function isDarkBackground(cssColor: string): boolean | null {
  const match = cssColor.match(/rgba?\(([^)]+)\)/);
  if (!match || !match[1]) return null;
  const parts = match[1].split(",").map((p) => parseFloat(p));
  const r = parts[0] ?? 0;
  const g = parts[1] ?? 0;
  const b = parts[2] ?? 0;
  const a = parts[3] ?? 1;
  if (a <= 0) return null;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5;
}

/** Walks up from `start` to the first opaque background and reads its luminance. */
export function themeIsDark(start: HTMLElement): boolean {
  let node: HTMLElement | null = start;
  while (node) {
    const verdict = isDarkBackground(getComputedStyle(node).backgroundColor);
    if (verdict !== null) return verdict;
    node = node.parentElement;
  }
  return false;
}

/**
 * Re-measure the WME skin from `probe` and apply the dark class.
 *
 * The probe must be the sidebar pane, never the current container: the walk looks for the
 * first opaque background, and a floating window parented to document.body would report
 * the body's background instead of the editor's actual skin. The sidebar pane stays in the
 * DOM even when its tab is not the visible one, and getComputedStyle still resolves on a
 * hidden element.
 */
export function applyThemeClass(probe: HTMLElement): void {
  document.documentElement.classList.toggle(DARK_THEME_CLASS, themeIsDark(probe));
}

/**
 * WME can switch skins at runtime without a page reload. Any skin switch churns
 * class/style attributes on body or html, so observe those as a trigger to re-measure the
 * actual background luminance. Our own class toggle re-fires the observer once with an
 * identical measurement, so the chain stops immediately. The delayed re-check covers async
 * stylesheet swaps that land after the attribute change.
 *
 * @returns a function that stops observing.
 */
export function watchTheme(probe: HTMLElement): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const remeasure = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      applyThemeClass(probe);
      setTimeout(() => applyThemeClass(probe), 500);
    }, 150);
  };
  const observer = new MutationObserver(remeasure);
  const options = {
    attributes: true,
    attributeFilter: ["class", "style", "wz-theme", "data-theme"],
  };
  observer.observe(document.documentElement, options);
  observer.observe(document.body, options);
  return () => {
    clearTimeout(timer);
    observer.disconnect();
  };
}
