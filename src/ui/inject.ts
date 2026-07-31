const injected = new Set<string>();

/**
 * Append a stylesheet once per id. Features call this from their own styles module; the id
 * keeps a second call (a re-init, a Tampermonkey re-injection) from stacking duplicate
 * <style> elements, and lets several features share the mechanism without clobbering one
 * another's flag.
 */
export function injectStyleOnce(id: string, css: string): void {
  if (injected.has(id)) return;
  const style = document.createElement("style");
  style.dataset.wmech = id;
  style.textContent = css;
  document.head.appendChild(style);
  injected.add(id);
}
