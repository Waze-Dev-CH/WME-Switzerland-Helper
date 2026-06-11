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

// WME's overlay button bar (top), next to the native layer-switcher/reload.
const OVERLAY_BAR_SELECTOR = ".overlay-buttons-container.top";
const STYLE_ELEMENT_ID = "wme-ch-reload-button-style";
const BUTTON_CLASS = "wme-ch-reload-button";
const MOUNT_RETRY_MS = 300;
const MOUNT_MAX_RETRIES = 20;

/**
 * A bus-icon button injected into WME's overlay button bar that refreshes the
 * PT stops layer (without moving the map) and spins while it loads — mirroring
 * the native reload button. The WME SDK has no API for overlay buttons, so this
 * is a self-contained DOM widget that fails silently if WME's markup changes.
 */
class ReloadButton {
  private button: HTMLElement | null = null;
  private retries = 0;
  private readonly onClick: () => void;
  private readonly title: string;

  constructor(args: { onClick: () => void; title: string }) {
    this.onClick = args.onClick;
    this.title = args.title;
  }

  mount(): void {
    if (this.button?.isConnected) return;

    const bar = document.querySelector(OVERLAY_BAR_SELECTOR);
    if (!bar) {
      if (this.retries++ >= MOUNT_MAX_RETRIES) {
        console.warn("[ReloadButton] overlay button bar not found");
        return;
      }
      setTimeout(() => this.mount(), MOUNT_RETRY_MS);
      return;
    }
    this.retries = 0;

    this.injectStyle();

    const button = document.createElement("wz-button");
    button.className = `overlay-button ${BUTTON_CLASS}`;
    button.setAttribute("color", "clear-icon");
    button.setAttribute("size", "md");
    button.setAttribute("type", "button");
    button.title = this.title;

    const icon = document.createElement("i");
    icon.className = "w-icon w-icon-bus";
    button.appendChild(icon);

    button.addEventListener("click", () => {
      if (button.classList.contains("is-loading")) return;
      this.onClick();
    });

    bar.appendChild(button);
    this.button = button;
  }

  unmount(): void {
    this.button?.remove();
    this.button = null;
  }

  setLoading(loading: boolean): void {
    if (!this.button) return;
    this.button.classList.toggle("is-loading", loading);
    if (loading) this.button.setAttribute("disabled", "");
    else this.button.removeAttribute("disabled");
  }

  private injectStyle(): void {
    if (document.getElementById(STYLE_ELEMENT_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ELEMENT_ID;
    style.textContent = `
      @keyframes wme-ch-reload-spin { to { transform: rotate(360deg); } }
      .${BUTTON_CLASS}.is-loading { pointer-events: none; opacity: 0.6; }
      .${BUTTON_CLASS}.is-loading .w-icon-bus {
        display: inline-block;
        animation: wme-ch-reload-spin 1s linear infinite;
      }
    `;
    document.head.appendChild(style);
  }
}

export { ReloadButton };
