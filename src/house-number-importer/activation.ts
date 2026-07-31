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
  /** Realigns the tab's master toggle. Injected so this stays DOM-free. */
  syncToggle: (checked: boolean) => void;
}

/**
 * The feature has three on/off controls: the layer-switcher checkbox, the tab's master
 * toggle and the keyboard shortcut. They mean the same thing, so all of them route through
 * here and `settings.enabled` is the single persisted truth.
 *
 * Every control except the one that fired is realigned. Rewriting a control from inside its
 * own change handler is at best redundant, and a loop if the SDK ever echoed the change back
 * as an event; leaving the other one stale makes it show the wrong state, and its next click
 * then sets the value already in force, which reads as a dead control.
 */
export function setImporterEnabled(
  ctx: ActivationContext,
  enabled: boolean,
  source: "checkbox" | "tab" | "shortcut",
): void {
  ctx.settings.update({ enabled });
  ctx.layer.setVisible(enabled);
  if (source !== "checkbox") ctx.syncCheckbox(enabled);
  if (source !== "tab") ctx.syncToggle(enabled);

  // Switching off empties the layer rather than merely hiding it: a hidden layer still
  // holds its features, and the counters in the tab would keep claiming numbers are
  // waiting to be imported.
  if (enabled) void ctx.controller.refresh();
  else ctx.controller.disable();
}
