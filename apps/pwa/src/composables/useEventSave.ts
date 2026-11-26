import { useI18n } from "vue-i18n";
import { reportCaught } from "@api";
import { apiFetch } from "./useApi";
import { useNotifications } from "./useNotifications";
import { fieldErrorsFromResponse } from "./useFormErrors";
import type { SubmitDone } from "./useEntitySubmit";
import type { EventSubmitPayload } from "../components/EventForm.types";
import { toEncounterBody } from "../utils/encounterMapping";

/**
 * Saves an EventForm submit (create or edit an encounter) — shared by the
 * calendar and the patient card (CORE-159). `onSaved` runs before the dialog
 * closes, so the caller can reload what it shows.
 */
export function useEventSave(where: string) {
  const { t } = useI18n();
  const notifications = useNotifications();

  async function reject(res: Response, done: SubmitDone): Promise<void> {
    const fieldErrors = await fieldErrorsFromResponse(res);
    if (fieldErrors) {
      done(false, fieldErrors);
      return;
    }
    notifications.show(t("user.planner.form.errorSave"), "error", undefined, { icon: "nav-planner" });
    done(false);
  }

  return async function saveEvent(payload: EventSubmitPayload, done: SubmitDone, onSaved: () => Promise<void> | void): Promise<void> {
    try {
      const res = await apiFetch(payload.id ? `/api/v1/encounter/${payload.id}` : "/api/v1/encounter", {
        method: payload.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toEncounterBody(payload)),
        handleErrors: false,
      });
      if (!res.ok) {
        await reject(res, done);
        return;
      }
      notifications.show(t(payload.id ? "user.planner.form.editSuccess" : "user.planner.form.success"), "success", undefined, { icon: "nav-planner" });
      await onSaved();
      done(true);
    } catch (err) {
      reportCaught(err, { where });
      notifications.show(t("user.planner.form.errorSave"), "error", undefined, { icon: "nav-planner" });
      done(false);
    }
  };
}
