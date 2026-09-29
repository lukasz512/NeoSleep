/**
 * The {name, firstName, lastName} triple every person list row hands to
 * AppAvatar (feed-card avatar slot) — previously spelled out inline, cast by
 * cast, in PatientsView/HCPView/LeadsView/UsersView. `name` is the API's
 * already-formatted display name (salutation included, see
 * apps/api/src/utils/personName.ts); first/last give exact initials.
 */
export interface PersonNameParts {
  name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
}

export function personAvatarProps(person: PersonNameParts): {
  name: string | null;
  firstName: string | null;
  lastName: string | null;
} {
  return {
    name: person.name ?? null,
    firstName: person.first_name ?? null,
    lastName: person.last_name ?? null,
  };
}
