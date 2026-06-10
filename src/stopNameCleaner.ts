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

// Whole-token expansions of common abbreviations found in SBB stop names.
const ABBREVIATION_EXPANSIONS: Record<string, string> = {
  Ptes: "Petites",
  Pte: "Petite",
  Pts: "Petits",
  Pt: "Petit",
  Gdes: "Grandes",
  Gde: "Grande",
  Gds: "Grands",
  Gd: "Grand",
  Ste: "Sainte",
  St: "Saint",
  Rte: "Route",
  "Bif.": "Bifurcation",
};

// True when the string is only uppercase letters (a canton abbreviation such as
// "NE" left after stripping the locality, e.g. "Saules NE" → "NE").
function isOnlyUppercaseLetters(value: string): boolean {
  return /^[A-Z]+$/.test(value);
}

// True when `prefix` (the part before the first comma) is a truncation/
// abbreviation of the locality ("La Chaux-de-F" for "La Chaux-de-Fonds").
function isTruncatedLocality(prefix: string, localityName: string): boolean {
  const p = prefix
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+$/u, "");
  const l = localityName.trim().toLowerCase();
  return p.length >= 3 && l.startsWith(p);
}

// Swiss railway brand tokens (CFF/SBB/FFS), removed from the name — the venue
// type suffix added later already carries it (e.g. "(gare CFF)").
const RAILWAY_BRAND_SUFFIXES = new Set(["cff", "sbb", "ffs"]);

function removeRailwayBrand(name: string): string {
  return name
    .split(" ")
    .filter((token) => !RAILWAY_BRAND_SUFFIXES.has(token.toLowerCase()))
    .join(" ")
    .trim();
}

// Removes the locality from the start of the designation. The locality can be
// followed by a comma, a space, or be the whole string; truncated/abbreviated
// forms before a comma are handled too. Never strips down to an empty string —
// a stop can legitimately be named after its village.
function stripLocalityPrefix(name: string, localityName: string): string {
  const loc = localityName.trim();
  if (loc.length > 0 && name.toLowerCase().startsWith(loc.toLowerCase())) {
    const next = name.charAt(loc.length);
    if (next === "" || next === "," || /\s/.test(next)) {
      const candidate = name
        .slice(loc.length)
        .replace(/^[\s,]+/u, "")
        .trim();
      if (candidate.length > 0 && !isOnlyUppercaseLetters(candidate)) {
        return candidate;
      }
      return name.trim();
    }
  }

  const commaIndex = name.indexOf(",");
  if (commaIndex !== -1) {
    const rest = name.slice(commaIndex + 1).trim();
    if (
      rest.length > 0 &&
      !isOnlyUppercaseLetters(rest) &&
      isTruncatedLocality(name.slice(0, commaIndex), loc)
    ) {
      return rest;
    }
  }

  return name.trim();
}

// Case-insensitive lookup of the expansion table (keys lowercased).
const ABBREVIATION_EXPANSIONS_LOWER = new Map(
  Object.entries(ABBREVIATION_EXPANSIONS).map(([abbr, full]) => [
    abbr.toLowerCase(),
    full,
  ]),
);

function expandAbbreviations(name: string): string {
  return name
    .split(" ")
    .map(
      (token) =>
        ABBREVIATION_EXPANSIONS_LOWER.get(token.toLowerCase()) ?? token,
    )
    .join(" ");
}

/**
 * Produces a clean, human-facing stop name from the SBB `designationofficial`:
 * removes a trailing transport-type parenthetical, strips the locality prefix
 * (only when it really is the locality), and expands common abbreviations.
 */
export function cleanStopName(rawName: string, localityName: string): string {
  // 1. Drop a trailing parenthetical, e.g. "(bateau)", "(télésiège)".
  let cleaned = rawName.replace(/\s*\([^)]*\)\s*$/u, "").trim();

  // 2. Remove railway brand tokens (CFF/SBB/FFS) — added back via the suffix.
  cleaned = removeRailwayBrand(cleaned);

  // 3. Remove the locality from the start of the name.
  cleaned = stripLocalityPrefix(cleaned, localityName);

  // 4. Expand common abbreviations (Ptes → Petites, …).
  cleaned = expandAbbreviations(cleaned).trim();

  // 5. Capitalize the first letter.
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}
