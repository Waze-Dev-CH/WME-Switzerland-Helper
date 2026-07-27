import type { Controller } from "./controller";
import type { AddressPointLayer } from "./map-layer";
import type { SettingsStore } from "./settings";

/**
 * What the two on/off controls are allowed to touch. Narrowed to the methods actually used
 * so the wiring can be exercised without a WME SDK instance.
 */
export interface ActivationContext {
  settings: SettingsStore;
  controller: Pick<Controller, "refresh" | "disable">;
  layer: Pick<AddressPointLayer, "setVisible">;
  /** Realigns the layer-switcher checkbox. Injected so this stays SDK-free. */
  syncCheckbox: (checked: boolean) => void;
}

/**
 * The feature has two on/off controls: the layer-switcher checkbox and the tab's master
 * toggle. They mean the same thing, so both route through here and `settings.enabled` is
 * the single persisted truth.
 *
 * `source` prevents re-entrancy: rewriting the checkbox from inside its own toggle handler
 * is at best redundant, and a loop if the SDK ever echoed the change back as an event.
 */
export function setImporterEnabled(
  ctx: ActivationContext,
  enabled: boolean,
  source: "checkbox" | "tab",
): void {
  ctx.settings.update({ enabled });
  ctx.layer.setVisible(enabled);
  if (source === "tab") ctx.syncCheckbox(enabled);

  // Switching off empties the layer rather than merely hiding it: a hidden layer still
  // holds its features, and the counters in the tab would keep claiming numbers are
  // waiting to be imported.
  if (enabled) void ctx.controller.refresh();
  else ctx.controller.disable();
}
