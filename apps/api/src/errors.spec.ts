import { describe, it, expect } from "vitest";
import { ValidationError, inferValidationField, inferValidationReason } from "./errors.js";

describe("inferValidationField (NEO-109)", () => {
  it.each([
    ["first_name is required", "first_name"],
    ["email cannot be blank", "email"],
    ["Phone must contain at least 9 digits", "phone"],
    ["notes must be at most 2000 characters", "notes"],
    ["parent_id does not reference an existing territory", "parent_id"],
    ["Invalid email format", "email"],
    ["Invalid file_url format", "file_url"],
    ["Invalid organization type: clinicx", "type"],
    ["Invalid lead status: foo", "status"],
    ["Invalid study_type 'x' — expected one of psg, hsat", "study_type"],
    ["Invalid status 'x' — expected one of a, b", "status"],
  ])("%s → %s", (message, field) => {
    expect(inferValidationField(message)).toBe(field);
  });

  it.each([
    "Missing patient id",
    "patient id is required",
    "Uploaded file is empty",
    "Unknown document: x",
    "An appointment must last between 5 and 480 minutes",
    "No partner jurisdiction for locale xx",
    "Practitioner must have an email address before activation",
    "Only an admin can change a practitioner's status directly",
  ])("names no field for %s", (message) => {
    expect(inferValidationField(message)).toBeUndefined();
  });
});

describe("inferValidationReason", () => {
  it("tells a missing value from a wrong one", () => {
    expect(inferValidationReason("first_name is required")).toBe("required");
    expect(inferValidationReason("email cannot be blank")).toBe("required");
    expect(inferValidationReason("Invalid email format")).toBe("invalid");
  });
});

describe("ValidationError", () => {
  it("an explicit field wins over the inferred one", () => {
    expect(new ValidationError("An appointment must last between 5 and 480 minutes", "end_at").field).toBe("end_at");
    expect(new ValidationError("first_name is required").field).toBe("first_name");
  });
});
