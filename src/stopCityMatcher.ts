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
 * Finds the WME city matching a stop's locality. Tries the locality name as-is;
 * if that fails and the name ends with a two-letter uppercase canton suffix
 * (e.g. "Brügg BE"), retries without it ("Brügg"). `lookupCity` performs the
 * actual WME lookup (e.g. Cities.getCity), injected so this stays pure.
 */
export function findCityForStop<T>(
  localityName: string,
  lookupCity: (cityName: string) => T | null,
): T | null {
  const direct = lookupCity(localityName);
  if (direct) return direct;

  const trimmed = localityName.trim();
  if (/[A-Z]{2}$/.test(trimmed)) {
    const withoutCanton = trimmed.slice(0, -3).trim();
    if (withoutCanton.length > 0) return lookupCity(withoutCanton);
  }

  return null;
}
