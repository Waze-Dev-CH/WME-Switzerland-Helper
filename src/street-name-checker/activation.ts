import type { HighlightLayer } from "./map-layer";
import type { Scanner } from "./scan";
import type { SettingsStore } from "./settings";

/**
 * What the two on/off controls are allowed to touch. Narrowed to the methods actually
 * used so the wiring can be exercised without a WME SDK instance.
 */
export interface ActivationContext {
  settings: SettingsStore;
  scanner: Pick<Scanner, "setPaused" | "disable">;
  layer: Pick<HighlightLayer, "setVisible">;
  /** Realigns the layer-switcher checkbox. Injected so this stays SDK-free. */
  syncCheckbox: (checked: boolean) => void;
}

/**
 * The feature has two on/off controls: the layer-switcher checkbox and the tab's master
 * toggle. They mean the same thing, so both route through here and `settings.enabled` is
 * the single persisted truth. Before this, the checkbox lived only in memory and came back
 * checked on every WME reload, restarting a scan the editor had switched off.
 *
 * `source` prevents re-entrancy: rewriting the checkbox from inside its own toggle handler
 * is at best redundant, and a loop if the SDK ever echoed the change back as an event.
 */
export function setCheckerEnabled(
  ctx: ActivationContext,
  enabled: boolean,
  source: "checkbox" | "tab",
): void {
  ctx.settings.update({ enabled });
  ctx.layer.setVisible(enabled);
  if (source === "tab") ctx.syncCheckbox(enabled);

  // Enabling clears any stale pause and kicks off a scan; disabling aborts the run and
  // empties the list, so a switched-off feature leaves nothing behind in the tab.
  if (enabled) ctx.scanner.setPaused(false);
  else ctx.scanner.disable();
}
