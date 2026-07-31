/*
 * Copyright (c) 2025 Maël Pedretti
 *
 * This file is part of WME Switzerland Helper.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

/**
 * Calculate the distance between two GPS coordinates using the Haversine formula
 * @param lat1 Latitude of first point
 * @param lon1 Longitude of first point
 * @param lat2 Latitude of second point
 * @param lon2 Longitude of second point
 * @returns Distance in meters
 */
function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000; // radius of Earth in meters
  const toRad = (x: number) => (x * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // distance in meters
}

interface DialogButton {
  label: string;
  value: string;
}

interface DialogOptions {
  message: string;
  buttons: DialogButton[];
  /**
   * Render `message` as markup instead of text. Off by default: messages interpolate
   * street names, venue names and error strings, and none of those may be able to
   * inject HTML into the editor page. Turn it on only for markup you wrote yourself.
   */
  allowHtml?: boolean;
  /**
   * Resolved when the user presses Escape or clicks outside the dialog. Omit to make
   * the buttons the only way out.
   */
  cancelValue?: string;
}

/**
 * Show a modal dialog to the user with custom buttons
 * @param options Dialog options including message and buttons
 * @returns Promise that resolves with the value of the clicked button
 */
function showWmeDialog(options: DialogOptions): Promise<string> {
  const { message, buttons, allowHtml = false, cancelValue } = options;
  return new Promise((resolve) => {
    // Backdrop doubles as the dismiss target and keeps the dialog above WME's own panels.
    const backdrop = document.createElement("div");
    backdrop.style.position = "fixed";
    backdrop.style.inset = "0";
    backdrop.style.background = "rgba(0,0,0,.35)";
    backdrop.style.zIndex = "10000";
    backdrop.style.display = "flex";
    backdrop.style.alignItems = "center";
    backdrop.style.justifyContent = "center";

    const modal = document.createElement("div");
    // WME theme tokens with light fallbacks: a hardcoded white box rendered as
    // white-on-white text once the editor switched to its dark skin.
    modal.style.background = "var(--wz-color-background, #ffffff)";
    modal.style.color = "var(--wz-color-on-background, #1b1d20)";
    modal.style.border = "1px solid var(--wz-color-hairline, #d9dde2)";
    modal.style.padding = "20px";
    modal.style.boxShadow = "0 2px 10px rgba(0,0,0,0.5)";
    modal.style.borderRadius = "6px";
    modal.style.textAlign = "center";
    modal.style.minWidth = "200px";
    modal.style.maxWidth = "min(90vw, 480px)";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");

    const msg = document.createElement("p");
    // Messages carry their own line breaks (confirm() used to render them); a plain
    // paragraph would collapse them into one run-on sentence.
    msg.style.whiteSpace = "pre-line";
    if (allowHtml) msg.innerHTML = message;
    else msg.textContent = message;
    modal.appendChild(msg);

    const close = (value: string) => {
      document.removeEventListener("keydown", onKeydown, true);
      backdrop.remove();
      resolve(value);
    };

    function onKeydown(event: KeyboardEvent) {
      if (event.key === "Escape" && cancelValue !== undefined) {
        event.stopPropagation();
        close(cancelValue);
      }
    }

    const rendered: HTMLButtonElement[] = [];
    buttons.forEach(({ label, value }) => {
      const btn = document.createElement("button");
      btn.textContent = label;
      btn.className = "btn btn-default";
      btn.style.margin = "5px";
      btn.onclick = () => close(value);
      modal.appendChild(btn);
      rendered.push(btn);
    });

    backdrop.appendChild(modal);
    backdrop.onclick = (event) => {
      if (event.target === backdrop && cancelValue !== undefined) close(cancelValue);
    };
    // Capture phase: WME binds its own editor shortcuts on the document.
    document.addEventListener("keydown", onKeydown, true);

    document.body.appendChild(backdrop);
    rendered[0]?.focus();
  });
}

async function waitForMapIdle(args: {
  wmeSDK: import("wme-sdk-typings").WmeSDK;
  intervalMs?: number;
  maxTries?: number;
}): Promise<void> {
  const { wmeSDK, intervalMs = 50, maxTries = 60 } = args;

  for (let i = 0; i < maxTries; i += 1) {
    if (!wmeSDK.State.isMapLoading()) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

export { haversineDistance, showWmeDialog, waitForMapIdle };
