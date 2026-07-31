import { describe, expect, it } from "vitest";
import { DARK_THEME_CLASS, tokenRules } from "./tokens";

/**
 * These values were inlined in the street-name checker's stylesheet before they moved
 * here. The assertions below are the non-regression guard for that move: the checker's
 * panel must keep rendering exactly as it did, in light and in dark.
 */
describe("tokenRules", () => {
  const css = tokenRules("chk", [".chk-pane", ".chk-helper", ".chk-window"]);

  it("declares the tokens on every scope it is given", () => {
    expect(css).toContain(".chk-pane, .chk-helper, .chk-window {");
  });

  it("scopes the dark block under the theme class, scope by scope", () => {
    expect(css).toContain(
      `html.${DARK_THEME_CLASS} .chk-pane, html.${DARK_THEME_CLASS} .chk-helper, html.${DARK_THEME_CLASS} .chk-window {`,
    );
  });

  it.each([
    ["--chk-bg", "var(--wz-color-background, #ffffff)"],
    ["--chk-surface", "var(--wz-color-background-variant, #f4f6f8)"],
    ["--chk-text", "var(--wz-color-on-background, #1b1d20)"],
    ["--chk-muted", "var(--wz-color-on-background-variant, #6b7280)"],
    ["--chk-border", "var(--wz-color-hairline, #d9dde2)"],
    ["--chk-primary", "var(--wz-color-primary, #2b5fa4)"],
    ["--chk-primary-contrast", "var(--wz-color-on-primary, #ffffff)"],
    ["--chk-info-bg", "rgba(43, 95, 164, .10)"],
    ["--chk-ok", "#3f8a32"],
    ["--chk-ok-bg", "rgba(63, 138, 50, .16)"],
    ["--chk-error", "#c0392b"],
    ["--chk-warn", "#b35c00"],
    ["--chk-warn-bg", "rgba(179, 92, 0, .12)"],
    ["--chk-fix", "#2e8b57"],
    ["--chk-ignore", "#6b7280"],
    ["--chk-radius", "8px"],
  ])("keeps the light value of %s", (token, value) => {
    expect(css).toContain(`  ${token}: ${value};`);
  });

  it.each([
    ["--chk-bg", "var(--wz-color-background, #1f2226)"],
    ["--chk-surface", "var(--wz-color-background-variant, #2a2e33)"],
    ["--chk-text", "var(--wz-color-on-background, #e6e8eb)"],
    ["--chk-muted", "var(--wz-color-on-background-variant, #9aa1aa)"],
    ["--chk-border", "var(--wz-color-hairline, #3a3f45)"],
    ["--chk-primary", "var(--wz-color-primary, #5b9bd5)"],
    ["--chk-info-bg", "rgba(91, 155, 213, .16)"],
    ["--chk-ok", "#6cc05a"],
    ["--chk-ok-bg", "rgba(108, 192, 90, .18)"],
    ["--chk-error", "#e57368"],
    ["--chk-warn", "#e0a35c"],
    ["--chk-warn-bg", "rgba(224, 163, 92, .16)"],
    ["--chk-fix", "#37a56a"],
    ["--chk-ignore", "#7b8494"],
  ])("keeps the dark value of %s", (token, value) => {
    const dark = css.slice(css.indexOf(`html.${DARK_THEME_CLASS}`));
    expect(dark).toContain(`  ${token}: ${value};`);
  });

  it("leaves the contrast and radius tokens out of the dark block", () => {
    // They do not change with the skin; redeclaring them would be noise to keep in sync.
    const dark = css.slice(css.indexOf(`html.${DARK_THEME_CLASS}`));
    expect(dark).not.toContain("--chk-primary-contrast");
    expect(dark).not.toContain("--chk-radius");
  });

  it("renames nothing when another feature asks for its own prefix", () => {
    const hn = tokenRules("hn", [".hn-pane"]);
    expect(hn).toContain("--hn-bg: var(--wz-color-background, #ffffff);");
    expect(hn).not.toContain("--chk-");
  });
});
