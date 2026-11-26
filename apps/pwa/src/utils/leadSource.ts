import type AppIcon from "../components/AppIcon.vue";

// Same InstanceType introspection hcoLabels.ts uses — a named type import from
// a .vue file only resolves through the "*.vue" shim's default export.
type AppIconName = InstanceType<typeof AppIcon>["$props"]["name"];

/**
 * Channels a lead can come in through (NEO-155) — the lead.source values the
 * API accepts (commands/lead.ts VALID_LEAD_SOURCES). "website" is what the
 * public demo form writes. Each one has its own badge icon on the lead avatar.
 */
export const LEAD_SOURCES = ["website", "social", "whatsapp", "phone", "referral", "event"] as const;

export type LeadSource = (typeof LEAD_SOURCES)[number];

export function isLeadSource(value: unknown): value is LeadSource {
  return typeof value === "string" && (LEAD_SOURCES as readonly string[]).includes(value);
}

/** Badge icon for a lead's channel, or null when the lead has no known channel. */
export function leadSourceIcon(source: string | null | undefined): AppIconName | null {
  return isLeadSource(source) ? `lead-source-${source}` : null;
}
