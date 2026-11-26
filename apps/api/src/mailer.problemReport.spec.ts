import { describe, it, expect } from "vitest";
import { buildProblemReportEmail } from "./mailer.js";

/** Trackable reports: the reporter's receipt and closing emails (copy only — sending is covered in mailer.spec.ts). */
const LINK = "https://pwa.example.test/my-reports?report=abc";

describe("buildProblemReportEmail", () => {
  it("confirms receipt with the report number in the reporter's language", () => {
    const { subject, html } = buildProblemReportEmail("dra@example.test", { firstName: "Lorena", language: "mx" }, {
      kind: "received",
      number: 42,
      trackerRef: null,
      reply: null,
      link: LINK,
    });
    expect(subject).toBe("Recibimos tu reporte #42");
    expect(html).toContain("Reporte #42 recibido");
    expect(html).toContain(LINK);
    expect(html).not.toContain("Ticket:");
  });

  it("carries the ticket and the team's reply when resolved, escaped", () => {
    const { subject, html } = buildProblemReportEmail("rep@example.test", { language: "en" }, {
      kind: "resolved",
      number: 7,
      trackerRef: "CORE-123",
      reply: "Fixed <b>today</b>",
      link: LINK,
    });
    expect(subject).toBe("Your report #7 was resolved");
    expect(html).toContain("Ticket: CORE-123");
    expect(html).toContain("Fixed &lt;b&gt;today&lt;/b&gt;");
    expect(html).not.toContain("<b>today</b>");
  });

  it("words won't fix as a closed report, in Polish too", () => {
    const { subject } = buildProblemReportEmail("pl@example.test", { language: "pl" }, {
      kind: "dismissed",
      number: 9,
      trackerRef: null,
      reply: null,
      link: LINK,
    });
    expect(subject).toBe("Informacja o Twoim zgłoszeniu #9");
  });
});
