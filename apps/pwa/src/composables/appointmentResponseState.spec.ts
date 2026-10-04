import { describe, it, expect } from "vitest";
import { appointmentResponseState } from "./useAppointments";

/** CORE-116: Citas shows "not confirmed yet" once the patient was asked and hasn't answered. */
describe("appointmentResponseState", () => {
  it("the patient's own answer wins", () => {
    expect(appointmentResponseState({ status: "scheduled", patient_response: "confirmed", confirm_request_sent_at: "2031-01-14T16:00:00Z" })).toBe("confirmed");
    expect(appointmentResponseState({ status: "scheduled", patient_response: "cannot_attend" })).toBe("cannot_attend");
  });

  it("asked, no answer → awaiting; never asked → nothing", () => {
    expect(appointmentResponseState({ status: "scheduled", patient_response: null, confirm_request_sent_at: "2031-01-14T16:00:00Z" })).toBe("awaiting");
    expect(appointmentResponseState({ status: "scheduled", patient_response: null, confirm_request_sent_at: null })).toBeNull();
  });

  it("only for scheduled visits", () => {
    expect(appointmentResponseState({ status: "cancelled", patient_response: null, confirm_request_sent_at: "2031-01-14T16:00:00Z" })).toBeNull();
  });
});
