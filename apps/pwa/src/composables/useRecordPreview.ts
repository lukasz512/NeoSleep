import type { AppAvatarEntityType } from "../types/formField";

/**
 * NEO-114: the tapped list row's identity (name + avatar), handed to the
 * record it opens so ItemDetailLayout can show the record header at once
 * instead of a placeholder while the record loads. That gives the NEO-97
 * page transition's flying avatar + name somewhere to land even when the
 * record API is slow. Memory only, one record at a time, and only for the
 * record that was just opened — a direct visit (URL, reload) has none and
 * keeps the placeholder.
 */
export type RecordPreviewAvatar = {
  name: string;
  entityType: AppAvatarEntityType;
  firstName?: string | null;
  lastName?: string | null;
  avatarUrl?: string | null;
  orgType?: string | null;
  specialty?: string | null;
};

export type RecordPreview = { title: string; avatar: RecordPreviewAvatar };

/** Lists whose rows show a person/org identity, by AppEntityList viewId. */
const ENTITY_BY_VIEW: Record<string, AppAvatarEntityType> = {
  patients: "patient",
  hcp: "hcp",
  hco: "hco",
  leads: "lead",
  users: "user",
};

/** A preview older than this belongs to an earlier visit, not this one. */
const MAX_AGE_MS = 30_000;

let current: { key: string; preview: RecordPreview; at: number } | null = null;

const keyOf = (routeName: string, id: string) => `${routeName}:${id}`;
const text = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value : null);

/** Builds a preview from a list item, or null for lists without an identity. */
export function recordPreviewFromItem(viewId: string, item: Record<string, unknown>): RecordPreview | null {
  const entityType = ENTITY_BY_VIEW[viewId];
  const name = text(item.name);
  if (!entityType || !name) return null;
  return {
    title: name,
    avatar: {
      name,
      entityType,
      firstName: text(item.first_name),
      lastName: text(item.last_name),
      avatarUrl: text(item.avatar_url),
      orgType: entityType === "hco" ? text(item.type) : null,
      specialty: entityType === "hcp" ? text(item.primary_specialty) ?? text(item.specialty) : null,
    },
  };
}

export function rememberRecordPreview(routeName: string, id: string, preview: RecordPreview): void {
  current = { key: keyOf(routeName, id), preview, at: Date.now() };
}

export function recordPreviewFor(routeName: unknown, id: unknown): RecordPreview | null {
  if (!current || typeof routeName !== "string" || typeof id !== "string") return null;
  if (current.key !== keyOf(routeName, id) || Date.now() - current.at > MAX_AGE_MS) return null;
  return current.preview;
}

/** Test hook. */
export function forgetRecordPreview(): void {
  current = null;
}
