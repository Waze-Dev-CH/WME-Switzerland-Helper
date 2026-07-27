import type { WmeSDK } from "wme-sdk-typings";
import type { Controller, Snapshot } from "../controller";
import { t } from "../i18n";
import { isImportInFlight } from "../import";
import { log } from "../log";
import type { SettingsStore } from "../settings";
import { button, el } from "./dom";
import { getStreetNameVerdict } from "../../street-check-bridge";
import {
  canBulkImport,
  countByStatus,
  formatCounts,
  formatImportButton,
  formatVerdict,
} from "./format";
import { injectStyles } from "./styles";

const CONTAINER_ID = "hn-import-helper";
/** The street-name checker's own box in the same panel; see render(). */
const CHECKER_BOX_ID = "chk-edit-helper";
/** WME rebuilds the panel asynchronously after a selection; retry until it is there. */
const INJECT_RETRY_DELAYS_MS = [0, 120, 400, 900];

/**
 * A small box inside WME's segment edit panel.
 *
 * This is where the bulk-import button has to live: the sidebar switches to WME's own
 * Selection panel the moment a segment is clicked, which is exactly when the editor wants
 * to import. Rather than opening a fourth DOM deviation with a floating window, this reuses
 * the one the CLAUDE.md already sanctions for the checker.
 *
 * DELIBERATE deviation from "no direct DOM hacks that bypass SDK events": the SDK exposes
 * no extension point for the segment edit panel. Containment is the checker's: only the
 * mount touches the DOM, behind a documented selector; selection, data and edits still go
 * through SDK events. If WME renames #edit-panel the box simply does not appear, warned
 * once, and nothing else breaks.
 */
export class EditPanelBox {
  private retryTimers: Array<ReturnType<typeof setTimeout>> = [];
  private warnedMissingPanel = false;
  private snapshot: Snapshot | null = null;

  constructor(
    private sdk: WmeSDK,
    private controller: Controller,
    private settings: SettingsStore,
  ) {}

  init(): void {
    injectStyles();
    this.controller.onUpdate((snapshot) => {
      this.snapshot = snapshot;
      this.schedule();
    });
    this.sdk.Events.on({ eventName: "wme-selection-changed", eventHandler: () => this.schedule() });
    this.schedule();
  }

  private schedule(): void {
    // Do not rebuild the box (and its button) while a batch is running underneath it.
    if (isImportInFlight()) return;
    for (const timer of this.retryTimers) clearTimeout(timer);
    this.retryTimers = [];

    const snapshot = this.snapshot;
    if (!this.settings.get().enabled || !snapshot || snapshot.segmentId === null) {
      document.getElementById(CONTAINER_ID)?.remove();
      return;
    }
    for (const delay of INJECT_RETRY_DELAYS_MS) {
      this.retryTimers.push(setTimeout(() => this.inject(), delay));
    }
  }

  private inject(): void {
    const snapshot = this.snapshot;
    if (!snapshot || snapshot.segmentId === null) return;

    const panel = document.querySelector("#edit-panel");
    if (!panel) {
      if (!this.warnedMissingPanel) {
        this.warnedMissingPanel = true;
        log.warn("#edit-panel not found; the edit-panel box is unavailable in this WME version");
      }
      return;
    }

    let container = document.getElementById(CONTAINER_ID);
    if (!container) {
      container = el("div", "hn-pane");
      container.id = CONTAINER_ID;
      panel.prepend(container);
    }
    this.render(container, snapshot);
  }

  private render(container: HTMLElement, snapshot: Snapshot): void {
    const children: HTMLElement[] = [
      el("div", "hn-street", `🏠 ${snapshot.streetName || "?"}`),
      el("div", "hn-note", formatCounts(countByStatus(snapshot.points))),
    ];

    // The checker's own box sits in this very panel and already reports the name verdict,
    // with its fix buttons. Repeating it here would be noise, so we only speak up when it
    // is absent.
    if (!document.getElementById(CHECKER_BOX_ID) && snapshot.segmentId !== null) {
      const verdict = formatVerdict(getStreetNameVerdict(snapshot.segmentId));
      if (verdict) children.push(el("div", `hn-verdict ${verdict.className}`, verdict.text));
    }

    if (snapshot.truncated) {
      children.push(el("div", "hn-warn", t("warnTruncated")));
    } else if (canBulkImport(snapshot)) {
      children.push(
        button(
          formatImportButton(snapshot.missing.length),
          () => void this.controller.importMissing(),
          "hn-btn hn-btn-primary",
        ),
      );
    }

    container.replaceChildren(...children);
  }
}
