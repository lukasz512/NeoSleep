import { useMutation, useQuery, useQueryCache, type EntryKey } from "@pinia/colada";
import type { MaybeRefOrGetter } from "vue";
import { toValue } from "vue";
import { apiFetch } from "./useApi";

/**
 * The patient card's data layer (CORE-181, ADR-029): every read is a query under a
 * key that starts with ["patient", id], and every write invalidates that prefix.
 * So a visit booked anywhere (header button, tile, calendar dialog) refreshes
 * every part of the card that shows it — without the window events the card
 * used before (patient-changed), and a card opened again shows its cached data
 * at once while it revalidates in the background.
 */
export const patientKeys = {
  /** Prefix of everything about one patient: invalidate this after any write. */
  root: (id: string) => ["patient", id] as const,
  detail: (id: string) => ["patient", id, "detail"] as const,
  summary: (id: string) => ["patient", id, "summary"] as const,
  appointments: (id: string) => ["patient", id, "appointments"] as const,
  events: (id: string) => ["patient", id, "events"] as const,
};

/** A failed read: `status` lets the card tell a real 404 from "server/offline". */
export class ApiReadError extends Error {
  constructor(
    readonly status: number,
    readonly response: Response | null,
  ) {
    super(`GET failed: ${status}`);
  }
}

/** GET a JSON resource; a non-2xx answer throws ApiReadError (callers report it). */
export async function getJson<T>(path: string): Promise<T> {
  const res = await apiFetch(path, { handleErrors: false });
  if (!res.ok) throw new ApiReadError(res.status, res);
  return (await res.json()) as T;
}

/** Fresh for 30 s: a card opened again inside that window doesn't refetch at all. */
const STALE_MS = 30_000;

export function usePatientQuery<T>(id: MaybeRefOrGetter<string>) {
  return useQuery<T, ApiReadError>({
    key: () => patientKeys.detail(toValue(id)),
    query: () => getJson<T>(`/api/v1/patient/${toValue(id)}`),
    enabled: () => !!toValue(id),
    staleTime: STALE_MS,
  });
}

export function usePatientPartQuery<T>(key: (id: string) => EntryKey, path: (id: string) => string, id: MaybeRefOrGetter<string>) {
  return useQuery<T, ApiReadError>({
    key: () => key(toValue(id)),
    query: () => getJson<T>(path(toValue(id))),
    enabled: () => !!toValue(id),
    staleTime: STALE_MS,
  });
}

/**
 * Refetch every query of one patient. A refetch that fails is not thrown: the
 * query keeps its last data and holds the error (the part shows its own state),
 * so callers can fire and forget without an unhandled rejection.
 */
function invalidatePatientQueries(cache: ReturnType<typeof useQueryCache>, id: string): Promise<void> {
  return cache.invalidateQueries({ key: [...patientKeys.root(id)] }).then(
    () => undefined,
    () => undefined,
  );
}

/** After any write about this patient: every active part of the card refetches, inactive ones on next use. */
export function useInvalidatePatient(): (id: string) => Promise<void> {
  const cache = useQueryCache();
  return (id) => invalidatePatientQueries(cache, id);
}

export interface PatientUpdateVars {
  id: string;
  data: Record<string, unknown>;
}

/** What the card shows until the server answers: the edited fields merged into the cached record. */
export function optimisticPatient<T extends Record<string, unknown>>(previous: T, data: Record<string, unknown>): T {
  const next = { ...previous, ...data } as Record<string, unknown>;
  if ("first_name" in data || "last_name" in data) {
    const name = [next.first_name, next.last_name].filter((v) => typeof v === "string" && v.trim()).join(" ");
    if (name) next.name = name;
  }
  return next as T;
}

/**
 * PATCH /patient/:id, optimistic: the card shows the edit at once, a failure puts
 * the cached record back (the caller shows the error), and either way the
 * patient's queries refetch so the card ends on what the server holds.
 */
export function useUpdatePatient<T extends Record<string, unknown>>() {
  const cache = useQueryCache();
  return useMutation({
    mutation: async ({ id, data }: PatientUpdateVars) => {
      const res = await apiFetch(`/api/v1/patient/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        handleErrors: false,
      });
      if (!res.ok) throw new ApiReadError(res.status, res);
      return (await res.json()) as T;
    },
    onMutate: ({ id, data }) => {
      const key = [...patientKeys.detail(id)];
      const previous = cache.getQueryData<T>(key);
      cache.cancelQueries({ key, exact: true });
      if (previous) cache.setQueryData(key, optimisticPatient(previous, data));
      return { previous };
    },
    onError: (_err, { id }, { previous }) => {
      if (previous) cache.setQueryData([...patientKeys.detail(id)], previous);
    },
    onSettled: (_data, _err, { id }) => invalidatePatientQueries(cache, id),
  });
}
