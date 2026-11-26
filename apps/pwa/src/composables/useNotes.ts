import { reportCaught, reportFailedResponse } from "@api";
import { getCurrentScope, onScopeDispose, ref } from "vue";
import { useI18n } from "vue-i18n";
import { apiFetch } from "./useApi";
import { useNotifications } from "./useNotifications";

export interface NoteItem {
  id: string;
  entity_type: string;
  entity_id: string;
  author_id: string | null;
  author_name: string | null;
  body: string;
  created_at: string;
}

/** Fired on window after a note is added or deleted, so every other useNotes
 *  instance showing the same record reloads (NEO-153: the desktop side panel
 *  and the Notes tab are mounted side by side). */
const NOTES_CHANGED_EVENT = "notes-changed";

interface NotesChangedDetail {
  entityType: string;
  entityId: string;
  source: symbol;
}

/**
 * Generic multi-author notes — used by PatientNotesPanel now, reusable
 * verbatim for practitioner/organization/lead later (entity_type/entity_id,
 * same shape as the note table itself).
 */
export function useNotes(entityType: string, entityId: () => string | undefined) {
  const { t } = useI18n();
  const notifications = useNotifications();

  const notes = ref<NoteItem[]>([]);
  const loading = ref(false);
  const loaded = ref(false);
  const loadError = ref(false);
  /** The error behind loadError (NEO-81) — lets the error state say offline vs. server problem. */
  const loadFailure = ref<unknown>(null);

  const instance = Symbol("useNotes");
  function announceChange(id: string): void {
    const detail: NotesChangedDetail = { entityType, entityId: id, source: instance };
    window.dispatchEvent(new CustomEvent<NotesChangedDetail>(NOTES_CHANGED_EVENT, { detail }));
  }
  function onNotesChanged(event: Event): void {
    const { detail } = event as CustomEvent<NotesChangedDetail>;
    if (detail.source === instance || detail.entityType !== entityType || detail.entityId !== entityId()) return;
    void loadNotes();
  }
  window.addEventListener(NOTES_CHANGED_EVENT, onNotesChanged);
  if (getCurrentScope()) onScopeDispose(() => window.removeEventListener(NOTES_CHANGED_EVENT, onNotesChanged));

  async function loadNotes(): Promise<void> {
    const id = entityId();
    if (!id) return;
    loading.value = true;
    loadError.value = false;
    loadFailure.value = null;
    try {
      const res = await apiFetch(
        `/api/v1/note?entity_type=${encodeURIComponent(entityType)}&entity_id=${encodeURIComponent(id)}`,
        { handleErrors: false }
      );
      if (res.ok) {
        const data = (await res.json()) as { items: NoteItem[] };
        notes.value = data.items;
      } else {
        loadFailure.value = await reportFailedResponse(res, { where: "useNotes.loadNotes" });
        loadError.value = true;
      }
    } catch (err) {
      reportCaught(err, { where: "useNotes.loadNotes" });
      loadFailure.value = err;
      loadError.value = true;
    } finally {
      loading.value = false;
      loaded.value = true;
    }
  }

  async function addNote(body: string): Promise<boolean> {
    const id = entityId();
    const trimmed = body.trim();
    if (!id || !trimmed) return false;
    try {
      const res = await apiFetch("/api/v1/note", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity_type: entityType, entity_id: id, body: trimmed }),
        handleErrors: false,
      });
      if (res.ok) {
        notifications.show(t("app.notes.addSuccess"), "success", undefined, { icon: "pencil" });
        announceChange(id);
        await loadNotes();
        return true;
      }
    } catch (err) {
      reportCaught(err, { where: "useNotes.addNote" });
      // fall through to the error toast below
    }
    notifications.show(t("app.notes.errorSave"), "error", undefined, { icon: "pencil" });
    return false;
  }

  async function deleteNote(noteId: string): Promise<boolean> {
    const id = entityId();
    try {
      const res = await apiFetch(`/api/v1/note/${noteId}`, { method: "DELETE", handleErrors: false });
      if (res.ok) {
        notes.value = notes.value.filter((n) => n.id !== noteId);
        if (id) announceChange(id);
        notifications.show(t("app.notes.deleteSuccess"), "success", undefined, { icon: "pencil" });
        return true;
      }
    } catch (err) {
      reportCaught(err, { where: "useNotes.deleteNote" });
      // fall through to the error toast below
    }
    notifications.show(t("app.notes.errorDelete"), "error", undefined, { icon: "pencil" });
    return false;
  }

  return { notes, loading, loaded, loadError, loadFailure, loadNotes, addNote, deleteNote };
}
