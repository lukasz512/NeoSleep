import { describe, it, expect } from "vitest";
import { HC_SECTION_KEYS, splitHistoriaClinica, collapseHistoriaClinica } from "./historiaClinica";

/** NEO-231 D2 (Dra. Lorena): Antecedentes · STOP-BANG · Exploración · ATM are one Historia clínica. */
const item = (key: string, status = "missing") => ({ key, status });

describe("splitHistoriaClinica", () => {
  it("takes the four sections (in clinical order) and the printable HC out of the list; the rest stays in order", () => {
    const items = [item("informedConsent"), item("medicalHistory"), item("stopBang"), item("oralExam"), item("tmjExam"), item("historiaEndo"), item("polysomnography")];
    const { sections, printable, rest } = splitHistoriaClinica(items);
    expect(sections.map((s) => s.key)).toEqual([...HC_SECTION_KEYS]);
    expect(printable?.key).toBe("historiaEndo");
    expect(rest.map((i) => i.key)).toEqual(["informedConsent", "polysomnography"]);
  });

  it("leaves everything alone when fewer than two sections are assigned", () => {
    const items = [item("informedConsent"), item("oralExam"), item("historiaEndo")];
    const { sections, printable, rest } = splitHistoriaClinica(items);
    expect(sections).toEqual([]);
    expect(printable).toBeNull();
    expect(rest).toBe(items);
  });
});

describe("collapseHistoriaClinica — the patient list's chips", () => {
  const form = (key: string, done: boolean) => ({ key, done, category: "document" as const, waiting_on_patient: false });

  it("AM/SB/EO/ATM/HC become one HC chip, done only when every section is", () => {
    const forms = [form("informedConsent", true), form("medicalHistory", true), form("stopBang", true), form("oralExam", false), form("tmjExam", true), form("historiaEndo", false), form("polysomnography", false)];
    const collapsed = collapseHistoriaClinica(forms);
    expect(collapsed.map((f) => [f.key, f.done])).toEqual([["informedConsent", true], ["historiaEndo", false], ["polysomnography", false]]);
    expect(collapsed[1]).toMatchObject({ sections: { done: 3, total: 4 } });
    expect(collapseHistoriaClinica(forms.map((f) => ({ ...f, done: true })))[1]!.done).toBe(true);
  });

  it("a patient still waiting on their part keeps waiting_on_patient on the HC chip", () => {
    const forms = [form("medicalHistory", false), form("stopBang", false), { ...form("stopBang", false), key: "oralExam" }];
    forms[0] = { ...forms[0]!, waiting_on_patient: true };
    expect(collapseHistoriaClinica(forms)[0]).toMatchObject({ key: "historiaEndo", waiting_on_patient: true });
  });
});
