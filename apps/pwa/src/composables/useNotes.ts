import { ref } from "vue";
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

  async function loadNotes(): Promise<void> {
    const id = entityId();
    if (!id) return;
    loading.value = true;
    loadError.value = false;
    try {
      const res = await apiFetch(
        `/api/v1/note?entity_type=${encodeURIComponent(entityType)}&entity_id=${encodeURIComponent(id)}`,
        { handleErrors: false }
      );
      if (res.ok) {
        const data = (await res.json()) as { items: NoteItem[] };
        notes.value = data.items;
      } else {
        loadError.value = true;
      }
    } catch {
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
        notifications.show(t("app.notes.addSuccess"), "success");
        await loadNotes();
        return true;
      }
    } catch {
      // fall through to the error toast below
    }
    notifications.show(t("app.notes.errorSave"), "error");
    return false;
  }

  async function deleteNote(noteId: string): Promise<boolean> {
    try {
      const res = await apiFetch(`/api/v1/note/${noteId}`, { method: "DELETE", handleErrors: false });
      if (res.ok) {
        notes.value = notes.value.filter((n) => n.id !== noteId);
        notifications.show(t("app.notes.deleteSuccess"), "success");
        return true;
      }
    } catch {
      // fall through to the error toast below
    }
    notifications.show(t("app.notes.errorDelete"), "error");
    return false;
  }

  return { notes, loading, loaded, loadError, loadNotes, addNote, deleteNote };
}
