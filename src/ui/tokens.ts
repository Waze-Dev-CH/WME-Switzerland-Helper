/**
 * Design tokens shared by every feature panel.
 *
 * Each token reads a WME design-system variable when present (so it follows the editor's
 * light/dark theme) and otherwise uses a light fallback. When WME exposes no token, the
 * `html.wmech-theme-dark` block swaps those fallbacks for dark values; that class is
 * toggled at runtime by measuring the WME sidebar's actual background luminance (NOT the
 * OS prefers-color-scheme, which can disagree with WME's own theme). The exact
 * `--wz-color-*` names are best-effort: a wrong name simply falls back, it never breaks
 * the layout.
 *
 * The rules are generated per feature prefix rather than shared under one variable name,
 * so a feature keeps reading `--chk-bg` or `--hn-bg` exactly as before while the VALUES
 * live in one place. Adding a feature costs one call; changing a colour costs one edit.
 */

/** Class set on <html> when the WME skin is dark. */
export const DARK_THEME_CLASS = "wmech-theme-dark";

const LIGHT: Record<string, string> = {
  bg: "var(--wz-color-background, #ffffff)",
  surface: "var(--wz-color-background-variant, #f4f6f8)",
  text: "var(--wz-color-on-background, #1b1d20)",
  muted: "var(--wz-color-on-background-variant, #6b7280)",
  border: "var(--wz-color-hairline, #d9dde2)",
  primary: "var(--wz-color-primary, #2b5fa4)",
  "primary-contrast": "var(--wz-color-on-primary, #ffffff)",
  "info-bg": "rgba(43, 95, 164, .10)",
  ok: "#3f8a32",
  "ok-bg": "rgba(63, 138, 50, .16)",
  error: "#c0392b",
  warn: "#b35c00",
  "warn-bg": "rgba(179, 92, 0, .12)",
  fix: "#2e8b57",
  ignore: "#6b7280",
  radius: "8px",
};

/** Only the tokens that differ in dark; the others keep their light value. */
const DARK: Record<string, string> = {
  bg: "var(--wz-color-background, #1f2226)",
  surface: "var(--wz-color-background-variant, #2a2e33)",
  text: "var(--wz-color-on-background, #e6e8eb)",
  muted: "var(--wz-color-on-background-variant, #9aa1aa)",
  border: "var(--wz-color-hairline, #3a3f45)",
  primary: "var(--wz-color-primary, #5b9bd5)",
  "info-bg": "rgba(91, 155, 213, .16)",
  ok: "#6cc05a",
  "ok-bg": "rgba(108, 192, 90, .18)",
  error: "#e57368",
  warn: "#e0a35c",
  "warn-bg": "rgba(224, 163, 92, .16)",
  fix: "#37a56a",
  ignore: "#7b8494",
};

function declarations(prefix: string, values: Record<string, string>): string {
  return Object.entries(values)
    .map(([name, value]) => `  --${prefix}-${name}: ${value};`)
    .join("\n");
}

/**
 * CSS declaring the tokens on the given selectors, in light and dark.
 *
 * @param prefix variable prefix without dashes; "chk" produces `--chk-bg`
 * @param scopes selectors that own the tokens, e.g. [".chk-pane", ".chk-helper"]
 */
export function tokenRules(prefix: string, scopes: string[]): string {
  const light = scopes.join(", ");
  const dark = scopes.map((scope) => `html.${DARK_THEME_CLASS} ${scope}`).join(", ");
  return `
${light} {
${declarations(prefix, LIGHT)}
}
${dark} {
${declarations(prefix, DARK)}
}`;
}
