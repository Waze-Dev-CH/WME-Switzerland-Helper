import { describe, expect, it } from "vitest";
import { statusIcon } from "./icons";
import { STATUS_ICONS, STATUS_STYLES } from "./map-layer";
import type { PointStatus } from "./status";

const statuses = Object.keys(STATUS_STYLES) as PointStatus[];

function decode(dataUri: string): string {
  return atob(dataUri.replace("data:image/svg+xml;base64,", ""));
}

describe("statusIcon", () => {
  // The regression worth guarding: btoa only encodes Latin-1, so a check mark typed as a
  // character rather than drawn as a path throws at runtime, not at build time.
  it("encodes every status without tripping over btoa", () => {
    for (const status of statuses) {
      expect(STATUS_ICONS[status]).toMatch(/^data:image\/svg\+xml;base64,/);
    }
  });

  it("draws the disc in the colour and opacity of its status", () => {
    for (const status of statuses) {
      const svg = decode(STATUS_ICONS[status]);
      expect(svg).toContain(`fill="${STATUS_STYLES[status].color}"`);
      expect(svg).toContain(`opacity="${STATUS_STYLES[status].opacity}"`);
      expect(svg.startsWith("<svg")).toBe(true);
      expect(svg.endsWith("</svg>")).toBe(true);
    }
  });

  it("draws a pictogram only where one is meant to be", () => {
    for (const status of statuses) {
      const hasPath = decode(STATUS_ICONS[status]).includes("<path");
      expect(hasPath).toBe(STATUS_STYLES[status].glyph !== undefined);
    }
  });

  it("gives the four statuses four distinct images", () => {
    expect(new Set(statuses.map((status) => STATUS_ICONS[status])).size).toBe(statuses.length);
  });

  it("stays ASCII whatever it is handed", () => {
    const svg = decode(statusIcon({ color: "#123456", opacity: 0.5, glyph: "check" }));
    expect(svg).toMatch(/^[\x20-\x7e]+$/);
  });
});
