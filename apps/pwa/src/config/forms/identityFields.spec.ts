import { describe, it, expect } from "vitest";
import { identityFields } from "./identityFields";

describe("identityFields", () => {
  it("returns title, first_name, last_name, email, phone in that order", () => {
    const fields = identityFields();
    expect(fields.map((f) => f.key)).toEqual(["title", "first_name", "last_name", "email", "phone"]);
  });

  it("first_name, last_name, email, phone are all required; title is not", () => {
    const fields = identityFields();
    const byKey = Object.fromEntries(fields.map((f) => [f.key, f]));
    expect(byKey.title.required).toBeFalsy();
    expect(byKey.first_name.required).toBe(true);
    expect(byKey.last_name.required).toBe(true);
    expect(byKey.email.required).toBe(true);
    expect(byKey.phone.required).toBe(true);
  });

  it("title (narrow) and first_name (wide) share a row summing to 12; last_name is cols:12 (its own row)", () => {
    const fields = identityFields();
    const byKey = Object.fromEntries(fields.map((f) => [f.key, f]));
    expect(byKey.title.cols).toBe(2);
    expect(byKey.first_name.cols).toBe(10);
    expect(byKey.last_name.cols).toBe(12);
  });

  it("phone is type 'phone' and title is type 'combobox' (free-entry + suggestions)", () => {
    const fields = identityFields();
    const byKey = Object.fromEntries(fields.map((f) => [f.key, f]));
    expect(byKey.phone.type).toBe("phone");
    expect(byKey.title.type).toBe("combobox");
  });

  it("email has an emailPlaceholder placeholder key and an 'at' icon", () => {
    const fields = identityFields();
    const email = fields.find((f) => f.key === "email")!;
    expect(email.placeholder).toBe("app.identity.form.emailPlaceholder");
    expect(email.icon).toBe("at");
  });

  it("title's options include a 'Dra.' entry alongside 'Dr.'", () => {
    const fields = identityFields();
    const title = fields.find((f) => f.key === "title")!;
    const values = (title.options as { value: unknown }[]).map((o) => o.value);
    expect(values).toContain("Dr.");
    expect(values).toContain("Dra.");
  });

  it("each call returns a fresh array (no shared object identity across consumers)", () => {
    const a = identityFields();
    const b = identityFields();
    expect(a).not.toBe(b);
    expect(a[0]).not.toBe(b[0]);
  });

  it("email's format rule rejects malformed addresses and accepts valid ones", () => {
    const fields = identityFields();
    const email = fields.find((f) => f.key === "email")!;
    const [formatRule] = email.rules!;
    expect(formatRule("not-an-email")).toBe("app.identity.form.validation.emailInvalid");
    expect(formatRule("missing-at-sign.com")).toBe("app.identity.form.validation.emailInvalid");
    expect(formatRule("a@b")).toBe("app.identity.form.validation.emailInvalid");
    expect(formatRule("rep@neosleepcare.com")).toBe(true);
  });
});
