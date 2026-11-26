/**
 * Historia clínica (NEO-231 D2, Dra. Lorena): the patient's clinical history
 * is one record with four sections — Antecedentes médicos, STOP-BANG,
 * Exploración de cavidad oral, Evaluación del ATM — and one printable PDF
 * (historiaEndo) that carries them all. The API still lists each section as
 * its own checklist item (each has its own records, QR and print); the app
 * shows them as tabs of one tile, and the patient list as one HC chip.
 */
export const HC_SECTION_KEYS = ["medicalHistory", "stopBang", "oralExam", "tmjExam"] as const;
/** The printable Historia clínica — prints every section. */
export const HC_PRINTABLE_KEY = "historiaEndo";

const isSection = (key: string) => (HC_SECTION_KEYS as readonly string[]).includes(key);

/**
 * The sections (in clinical order), the printable HC and everything else.
 * Fewer than two sections assigned → nothing to group, the list is returned as is.
 */
export function splitHistoriaClinica<T extends { key: string }>(items: T[]): { sections: T[]; printable: T | null; rest: T[] } {
  const sections = HC_SECTION_KEYS.map((key) => items.find((i) => i.key === key)).filter((i): i is T => !!i);
  if (sections.length < 2) return { sections: [], printable: null, rest: items };
  return {
    sections,
    printable: items.find((i) => i.key === HC_PRINTABLE_KEY) ?? null,
    rest: items.filter((i) => !isSection(i.key) && i.key !== HC_PRINTABLE_KEY),
  };
}

interface IntakeForm {
  key: string;
  done: boolean;
  category?: "document" | "study";
  waiting_on_patient?: boolean;
}

/** The patient list's chips: the sections + printable HC collapse into one HC chip, done when every section is. */
export function collapseHistoriaClinica<T extends IntakeForm>(forms: T[]): (T | (IntakeForm & { sections: { done: number; total: number } }))[] {
  const { sections, rest } = splitHistoriaClinica(forms);
  if (!sections.length) return forms;
  const firstIndex = forms.findIndex((f) => isSection(f.key) || f.key === HC_PRINTABLE_KEY);
  const done = sections.filter((s) => s.done).length;
  const chip = {
    key: HC_PRINTABLE_KEY,
    done: done === sections.length,
    category: "document" as const,
    waiting_on_patient: sections.some((s) => s.waiting_on_patient),
    sections: { done, total: sections.length },
  };
  const before = forms.slice(0, firstIndex).filter((f) => rest.includes(f));
  const after = forms.slice(firstIndex).filter((f) => rest.includes(f));
  return [...before, chip, ...after];
}
