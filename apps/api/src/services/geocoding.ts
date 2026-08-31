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
  country_code?: string | null;
}

export interface Coordinates {
  lat: number;
  lng: number;
}

function buildAddressString(address: GeocodeAddress): string {
  return [address.address_line1, address.city, address.state, address.postal_code, address.country_code]
    .filter((part): part is string => !!part?.trim())
    .join(", ");
}

export async function geocodeAddress(address: GeocodeAddress): Promise<Coordinates | null> {
  if (!GOOGLE_MAPS_SERVER_API_KEY) return null;

  const addressString = buildAddressString(address);
  if (!addressString) return null;

  try {
    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    url.searchParams.set("address", addressString);
    url.searchParams.set("key", GOOGLE_MAPS_SERVER_API_KEY);

    const res = await fetch(url);
    if (!res.ok) return null;

    const data = (await res.json()) as {
      status: string;
      results?: { geometry?: { location?: { lat: number; lng: number } } }[];
    };
    if (data.status !== "OK") return null;

    const location = data.results?.[0]?.geometry?.location;
    if (!location) return null;

    return { lat: location.lat, lng: location.lng };
  } catch (err) {
    console.error("[geocoding] geocodeAddress failed (non-fatal, organization save still proceeds):", err);
    return null;
  }
}
