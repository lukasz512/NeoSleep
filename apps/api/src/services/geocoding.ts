import { GOOGLE_MAPS_SERVER_API_KEY } from "../env.js";

/**
 * Resolves an organization's address to lat/lng for the public "find a
 * specialist" map (apps/web/src/views/FindSpecialistView.vue). Uses Google's
 * Geocoding API — a plain server-side API key, not the OAuth flow Calendar
 * needs. Called from commands/organization.ts on every create/update, so
 * this must be best-effort: never throws, returns null on any failure
 * (unconfigured key, empty address, network error, no match) rather than
 * blocking a save over a geocoding hiccup.
 */

export interface GeocodeAddress {
  address_line1?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  /**
   * ISO country that only biases the lookup (Google's `region`), e.g. the
   * clinic's territory country. The stored country_code is deliberately NOT
   * part of the query: the address decides the country (NEO-210 D1).
   */
  region_hint?: string | null;
}

export interface Coordinates {
  lat: number;
  lng: number;
  /** ISO 3166-1 alpha-2 country the address resolved to, or null when Google gave none. */
  countryCode: string | null;
}

interface GeocodeResult {
  geometry?: { location?: { lat: number; lng: number } };
  address_components?: { short_name?: string; types?: string[] }[];
}

function buildAddressString(address: GeocodeAddress): string {
  return [address.address_line1, address.city, address.state, address.postal_code]
    .filter((part): part is string => !!part?.trim())
    .join(", ");
}

function countryOf(result: GeocodeResult): string | null {
  const code = result.address_components?.find((c) => c.types?.includes("country"))?.short_name?.trim().toUpperCase();
  return code && /^[A-Z]{2}$/.test(code) ? code : null;
}

export async function geocodeAddress(address: GeocodeAddress): Promise<Coordinates | null> {
  if (!GOOGLE_MAPS_SERVER_API_KEY) return null;

  const addressString = buildAddressString(address);
  if (!addressString) return null;

  try {
    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    url.searchParams.set("address", addressString);
    url.searchParams.set("key", GOOGLE_MAPS_SERVER_API_KEY);
    const hint = address.region_hint?.trim().toLowerCase();
    if (hint && /^[a-z]{2}$/.test(hint)) url.searchParams.set("region", hint);

    const res = await fetch(url);
    if (!res.ok) return null;

    const data = (await res.json()) as { status: string; results?: GeocodeResult[] };
    if (data.status !== "OK") return null;

    const first = data.results?.[0];
    const location = first?.geometry?.location;
    if (!first || !location) return null;

    return { lat: location.lat, lng: location.lng, countryCode: countryOf(first) };
  } catch (err) {
    console.error("[geocoding] geocodeAddress failed (non-fatal, organization save still proceeds):", err);
    return null;
  }
}
