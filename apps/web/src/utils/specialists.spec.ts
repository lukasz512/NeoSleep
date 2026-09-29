import { describe, it, expect } from "vitest";
import {
  addressLine,
  availableSpecialties,
  directionsHref,
  matchesSearch,
  matchesSpecialty,
  normalizeForSearch,
  specialtiesOf,
  telHref,
  websiteHref,
  type LabelledSpecialty,
  type Specialist,
} from "./specialists";

function specialist(overrides: Partial<Specialist> = {}): Specialist {
  return {
    id: "org-1",
    name: "Clínica Dental Roma Norte",
    address_line1: "Av. Álvaro Obregón 120",
    city: "Ciudad de México",
    state: "CDMX",
    country_code: "MX",
    phone: "+52 55 1234 5678",
    website: null,
    google_link: null,
    specialties: ["dentist"],
    latitude: 19.4189,
    longitude: -99.1606,
    practitioners: [],
    ...overrides,
  };
}

const LABELS: Record<LabelledSpecialty, string[]> = {
  dentist: ["Dentist", "Dentysta", "Dentista"],
  ent: ["ENT specialist", "Laryngolog", "Otorrinolaringólogo"],
  pulmonologist: ["Pulmonologist", "Pulmonolog", "Neumólogo"],
  gp: ["General practitioner", "Lekarz rodzinny", "Médico general"],
  neurologist: ["Neurologist", "Neurolog", "Neurólogo"],
  psychiatrist: ["Psychiatrist", "Psychiatra", "Psiquiatra"],
  cardiologist: ["Cardiologist", "Kardiolog", "Cardiólogo"],
  internist: ["Internist", "Internista", "Internista"],
};
const labelsFor = (code: LabelledSpecialty) => LABELS[code];

describe("matchesSearch", () => {
  it("an empty query matches everything", () => {
    expect(matchesSearch(specialist(), "   ", labelsFor)).toBe(true);
  });

  it.each(["dentista", "DENTYSTA", "dentist", "Dentist"])("finds a dentist by the word %s in any site language", (q) => {
    expect(matchesSearch(specialist(), q, labelsFor)).toBe(true);
    expect(matchesSearch(specialist({ specialties: ["ent"] }), q, labelsFor)).toBe(false);
  });

  it("is accent- and case-insensitive over name, address, city and state", () => {
    expect(matchesSearch(specialist(), "clinica dental", labelsFor)).toBe(true);
    expect(matchesSearch(specialist(), "obregon", labelsFor)).toBe(true);
    expect(matchesSearch(specialist(), "ciudad de mexico", labelsFor)).toBe(true);
    expect(matchesSearch(specialist(), "cdmx", labelsFor)).toBe(true);
  });

  it("needs every word to match somewhere", () => {
    expect(matchesSearch(specialist(), "dentista roma", labelsFor)).toBe(true);
    expect(matchesSearch(specialist(), "dentista guadalajara", labelsFor)).toBe(false);
  });

  it("matches a doctor's name and a doctor's specialty", () => {
    const s = specialist({ specialties: [], practitioners: [{ id: "p", name: "Dra. Lucía Hernández", specialties: ["pulmonologist"] }] });
    expect(matchesSearch(s, "hernandez", labelsFor)).toBe(true);
    expect(matchesSearch(s, "neumologo", labelsFor)).toBe(true);
  });

  it("does not search the postcode or street number as a promise it can't keep — only real fields", () => {
    expect(matchesSearch(specialist(), "06700", labelsFor)).toBe(false);
  });
});

describe("specialties", () => {
  it("merges clinic and doctor specialties, labelled ones only, in vocabulary order", () => {
    const s = specialist({ specialties: ["other", "ent"], practitioners: [{ id: "p", name: "x", specialties: ["dentist", "ent"] }] });
    expect(specialtiesOf(s)).toEqual(["dentist", "ent"]);
  });

  it("chips list only the specialties present", () => {
    expect(availableSpecialties([specialist(), specialist({ specialties: ["pulmonologist"] })])).toEqual(["dentist", "pulmonologist"]);
    expect(availableSpecialties([])).toEqual([]);
  });

  it("filters by the chosen chip; null means all", () => {
    expect(matchesSpecialty(specialist(), null)).toBe(true);
    expect(matchesSpecialty(specialist(), "dentist")).toBe(true);
    expect(matchesSpecialty(specialist(), "ent")).toBe(false);
  });
});

describe("links", () => {
  it("telHref keeps a leading + and the digits only", () => {
    expect(telHref("+52 55 1234 5678")).toBe("tel:+525512345678");
    expect(telHref("(55) 1234-5678")).toBe("tel:5512345678");
    expect(telHref("123")).toBeNull();
    expect(telHref(null)).toBeNull();
  });

  it("directionsHref prefers the clinic's own Google link, else a directions URL to the pin", () => {
    expect(directionsHref(specialist())).toBe("https://www.google.com/maps/dir/?api=1&destination=19.4189,-99.1606");
    expect(directionsHref(specialist({ google_link: "maps.app.goo.gl/x" }))).toBe("https://maps.app.goo.gl/x");
  });

  it("websiteHref normalizes a bare domain and rejects anything that is not http(s)", () => {
    expect(websiteHref("example.com")).toBe("https://example.com/");
    expect(websiteHref("http://example.com/a")).toBe("http://example.com/a");
    expect(websiteHref("javascript:alert(1)")).toBeNull();
    expect(websiteHref("  ")).toBeNull();
    expect(websiteHref(null)).toBeNull();
  });

  it("addressLine drops empty parts", () => {
    expect(addressLine(specialist({ state: null }))).toBe("Av. Álvaro Obregón 120, Ciudad de México");
  });

  it("normalizeForSearch strips accents", () => {
    expect(normalizeForSearch("  Médico GENERAL ")).toBe("medico general");
  });
});
