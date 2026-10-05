import type { LocaleCode } from "../i18n";

/**
 * Small flags marking the language of a message, as inline SVG data URIs.
 *
 * Not emoji: Windows ships no glyph for regional indicators and Chrome there renders
 * "🇫🇷" as the bare letters "FR" in a box (see the note in src/ui/tab-group.ts). The flag
 * stands for the language, not the country; it is always shown next to the language name
 * in its tooltip.
 */
const SVG: Record<LocaleCode, string> = {
  fr:
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 3 2'>" +
    "<path fill='#0055a4' d='M0 0h1v2H0z'/><path fill='#fff' d='M1 0h1v2H1z'/>" +
    "<path fill='#ef4135' d='M2 0h1v2H2z'/></svg>",
  it:
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 3 2'>" +
    "<path fill='#009246' d='M0 0h1v2H0z'/><path fill='#fff' d='M1 0h1v2H1z'/>" +
    "<path fill='#ce2b37' d='M2 0h1v2H2z'/></svg>",
  de:
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 5 3'>" +
    "<path fill='#000' d='M0 0h5v1H0z'/><path fill='#dd0000' d='M0 1h5v1H0z'/>" +
    "<path fill='#ffce00' d='M0 2h5v1H0z'/></svg>",
  en:
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 60 30'>" +
    "<clipPath id='s'><path d='M0 0v30h60V0z'/></clipPath>" +
    "<clipPath id='t'><path d='M30 15h30v15zv15H0zH0V0zV0h30z'/></clipPath>" +
    "<g clip-path='url(#s)'><path fill='#012169' d='M0 0v30h60V0z'/>" +
    "<path stroke='#fff' stroke-width='6' d='M0 0l60 30m0-30L0 30'/>" +
    "<path stroke='#c8102e' stroke-width='4' clip-path='url(#t)' d='M0 0l60 30m0-30L0 30'/>" +
    "<path stroke='#fff' stroke-width='10' d='M30 0v30M0 15h60'/>" +
    "<path stroke='#c8102e' stroke-width='6' d='M30 0v30M0 15h60'/></g></svg>",
};

export const FLAG_SRC: Record<LocaleCode, string> = {
  fr: `data:image/svg+xml,${encodeURIComponent(SVG.fr)}`,
  de: `data:image/svg+xml,${encodeURIComponent(SVG.de)}`,
  it: `data:image/svg+xml,${encodeURIComponent(SVG.it)}`,
  en: `data:image/svg+xml,${encodeURIComponent(SVG.en)}`,
};
