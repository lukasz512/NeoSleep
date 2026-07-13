export const DEMO_SPECIALTIES: Record<string, string> = {
  "City Hospital North":  "Pulmonology & Sleep Medicine",
  "Clinic Central":       "ENT & Sleep-Disordered Breathing",
  "Medical Center Alpha": "Internal Medicine",
  "Warsaw Medical Center":"Otolaryngology",
  "Hospital East":        "Pulmonology",
  "Sleep Clinic West":    "Sleep Medicine",
};

export const DEMO_NOTES: Record<string, string> = {
  "City Hospital North":  "Interested in NeoSleep protocol for post-op patients. Follow up after Q1 conference.",
  "Clinic Central":       "Attended the OrthApnea webinar. Requested clinical evidence deck. High potential.",
  "Medical Center Alpha": "Initial contact made via email. Waiting for call-back. Referred by Dr. Nowak.",
};

export const SPECIALTY_COLORS = ["teal", "violet", "amber", "blue", "green", "indigo"] as const;

export const REGION_COORDS: Record<string, { lat: number; lng: number }> = {
  North:   { lat: 52.27, lng: 20.97 },
  Central: { lat: 52.23, lng: 21.01 },
  South:   { lat: 52.17, lng: 21.03 },
  East:    { lat: 52.24, lng: 21.09 },
  West:    { lat: 52.22, lng: 20.92 },
};

export function getMapUrl(region?: string): string {
  const coords = REGION_COORDS[region ?? ""] ?? REGION_COORDS["Central"];
  const d = 0.018;
  const bbox = `${coords.lng - d},${coords.lat - d},${coords.lng + d},${coords.lat + d}`;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${coords.lat},${coords.lng}`;
}
