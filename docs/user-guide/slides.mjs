/**
 * Doctor user guide — structure (language-neutral). Texts live in
 * content/<locale>.json under the same ids; screenshots in shots/<locale>/.
 *
 * Each task slide names one shot. A shot is a recipe: where to go, what to
 * do before the picture, and which elements get a numbered marker. Marker
 * N on the picture is step N in the slide's text.
 */

/** @typedef {import("playwright").Page} Page */
/** @typedef {{ name: string, auth: boolean, clip?: { x: number, y: number, width: number, height: number }, clipTo?: (page: Page) => import("playwright").Locator, run: (page: Page, ctx: { base: string }) => Promise<void>, markers: (page: Page) => Array<import("playwright").Locator | { loc: import("playwright").Locator, side: "right" }> }} Shot */

/** Opens a demo patient from the list, optionally on one tab. */
async function openPatient(page, base, name, tab) {
  await page.goto(`${base}/patients`);
  await page.getByText(name, { exact: true }).first().click();
  await page.getByTestId("patient-book-appointment").waitFor();
  if (tab) {
    await page.getByRole("tab", { name: tab }).click();
    await page.waitForTimeout(800);
  }
}

const dialog = (page) => page.getByTestId("app-form-dialog").last();

/** Device products come live from the lab; locally there is no lab, so the picture gets neutral names. */
const stubProducts = (page) =>
  page.route("**/api/v1/partners/orthoapnea/products", (route) =>
    route.fulfill({ json: { items: [{ id: 3, code: "002", nameEs: "DAM estándar", category: "dam" }, { id: 4, code: "003", nameEs: "DAM ATM", category: "dam" }] } }),
  );

/** The sign-in card without most of the backdrop. */
const AUTH_CARD = { x: 320, y: 110, width: 640, height: 520 };

/** @type {Record<string, Shot>} */
export const SHOTS = {
  login: {
    name: "login",
    auth: false,
    clip: AUTH_CARD,
    run: async (page, { base }) => {
      await page.goto(`${base}/login`);
      await page.getByRole("button", { name: /iniciar sesión|sign in/i }).waitFor();
    },
    markers: (page) => [
      page.locator(".v-field").nth(0),
      page.locator(".v-field").nth(1),
      page.locator(".v-checkbox").first(),
      page.getByRole("button", { name: /iniciar sesión|sign in/i }),
    ],
  },
  forgot: {
    name: "forgot",
    auth: false,
    clip: AUTH_CARD,
    run: async (page, { base }) => {
      await page.goto(`${base}/login`);
      await page.getByText(/olvidaste|forgot/i).first().click();
      await page.getByRole("button", { name: /enviar|send/i }).first().waitFor();
    },
    markers: (page) => [
      page.locator(".v-field").nth(0),
      page.getByRole("button", { name: /enviar|send/i }).first(),
    ],
  },
  reset: {
    name: "reset",
    auth: false,
    clip: AUTH_CARD,
    run: async (page, { base }) => {
      // The real link carries a one-time token from the email; the picture only needs the form.
      await page.route("**/api/v1/auth/reset-password/validate**", (route) => route.fulfill({ json: { valid: true } }));
      await page.goto(`${base}/reset-password?token=guide-demo`);
      await page.locator('input[type="password"]').first().waitFor();
    },
    markers: (page) => [
      page.locator(".v-field").nth(0),
      page.locator(".v-field").nth(1),
      page.getByRole("button").filter({ hasText: /contraseña|password/i }).last(),
    ],
  },

  // Order matters from here: the QR shot creates a real questionnaire request,
  // so it comes after every shot that shows patient lists or Tester Patient-1.
  patients: {
    name: "patients",
    auth: true,
    clip: { x: 212, y: 84, width: 1040, height: 360 },
    run: async (page, { base }) => {
      await page.goto(`${base}/patients`);
      await page.getByText("Tester Patient-1", { exact: true }).first().waitFor();
    },
    markers: (page) => [
      page.getByTestId("entity-list-search"),
      page.getByRole("button", { name: "Añadir paciente" }),
      { loc: page.getByText("Tester Patient-2", { exact: true }).first(), side: "right" },
      page.getByRole("button", { name: /seguimiento del dispositivo/i }).first(),
    ],
  },
  patientAdd: {
    name: "patientAdd",
    auth: true,
    clipTo: dialog,
    run: async (page, { base }) => {
      await page.goto(`${base}/patients`);
      await page.getByRole("button", { name: "Añadir paciente" }).click();
      const d = dialog(page);
      await d.getByLabel("Nombre", { exact: true }).fill("Tester");
      await d.getByLabel("Apellido", { exact: true }).fill("Patient-5");
      await d.getByRole("radio", { name: "Femenino" }).click();
      await d.getByLabel("Correo electrónico").fill("tester.patient5@example.com");
      await d.getByLabel("Teléfono").fill("55 1234 5605");
    },
    markers: (page) => [
      dialog(page).locator(".v-field").nth(1),
      dialog(page).getByRole("radio", { name: "Femenino" }),
      dialog(page).getByTestId("date-field-date"),
      dialog(page).locator(".v-field").filter({ has: page.getByLabel("Correo electrónico") }),
      dialog(page).getByRole("button", { name: "Añadir paciente" }),
    ],
  },
  patientDetail: {
    name: "patientDetail",
    auth: true,
    clip: { x: 212, y: 84, width: 1040, height: 520 },
    run: async (page, { base }) => openPatient(page, base, "Tester Patient-2"),
    markers: (page) => [
      page.getByRole("tablist").first(),
      page.getByText("Siguiente paso", { exact: true }).first(),
      page.getByText("Documentos y estudios", { exact: true }).first(),
      page.getByTestId("patient-book-appointment"),
    ],
  },
  psgFill: {
    name: "psgFill",
    auth: true,
    clipTo: dialog,
    run: async (page, { base }) => {
      await openPatient(page, base, "Tester Patient-4", "Estudios");
      await page.getByRole("button", { name: /llenar/i }).first().click();
      await dialog(page).getByRole("button", { name: "Guardar" }).waitFor();
    },
    markers: (page) => [
      dialog(page).getByTestId("date-field-date"),
      dialog(page).locator(".v-field").filter({ hasText: "Estado" }).first(),
      dialog(page).locator(".v-field").filter({ hasText: "Puntuación IAH" }).first(),
      dialog(page).locator(".v-field").filter({ hasText: "Interpretación del médico" }).first(),
      dialog(page).getByRole("button", { name: "Guardar" }),
    ],
  },
  psgResult: {
    name: "psgResult",
    auth: true,
    clip: { x: 212, y: 84, width: 1040, height: 440 },
    run: async (page, { base }) => openPatient(page, base, "Tester Patient-2", "Estudios"),
    markers: (page) => [
      page.getByRole("button", { name: "Agregar estudio" }),
      page.getByText(/^Completado el/).first(),
      { loc: page.getByText(/saos/i).first(), side: "right" },
    ],
  },
  visit: {
    name: "visit",
    auth: true,
    clipTo: dialog,
    run: async (page, { base }) => {
      await openPatient(page, base, "Tester Patient-4");
      await page.getByTestId("patient-book-appointment").click();
      await page.getByTestId("appointment-submit").waitFor();
      await dialog(page).getByLabel("Notas").fill("Primera cita: valoración y estudio.");
    },
    markers: (page) => [
      dialog(page).getByTestId("date-field-date"),
      dialog(page).getByTestId("date-field-time"),
      dialog(page).locator(".v-field").filter({ hasText: "Duración" }).first(),
      dialog(page).locator(".v-field").filter({ hasText: "Notas" }).first(),
      page.getByTestId("appointment-submit"),
    ],
  },
  documents: {
    name: "documents",
    auth: true,
    clip: { x: 212, y: 180, width: 688, height: 600 },
    run: async (page, { base }) => openPatient(page, base, "Tester Patient-2", "Documentos"),
    markers: (page) => [
      page.getByText(/de 6 completados/).first(),
      page.getByText("Consentimiento informado", { exact: true }).first(),
      page.getByText("STOP-BANG", { exact: true }).first(),
      page.getByRole("button", { name: /llenar/i }).first(),
      page.getByRole("button", { name: "Enviar por correo" }),
    ],
  },
  order: {
    name: "order",
    auth: true,
    clipTo: dialog,
    run: async (page, { base }) => {
      await stubProducts(page);
      await openPatient(page, base, "Tester Patient-2", "Dispositivo");
      await page.getByRole("button", { name: "Nueva solicitud de dispositivo" }).click();
      await page.getByTestId("wizard-step-2").waitFor();
      await dialog(page).locator("input").nth(0).fill("-2");
      await dialog(page).locator("input").nth(1).fill("8");
      await dialog(page).getByText("Paso 1: Mediciones del paciente").click();
      await page.waitForTimeout(800);
    },
    markers: (page) => [
      page.getByTestId("wizard-step-2"),
      dialog(page).locator("input").nth(0),
      dialog(page).locator("input").nth(1),
      dialog(page).getByText("Rango avance mandibular"),
      dialog(page).getByRole("button", { name: /siguiente|continuar|next/i }).last(),
    ],
  },
  tracking: {
    name: "tracking",
    auth: true,
    clip: { x: 212, y: 84, width: 688, height: 380 },
    run: async (page, { base }) => openPatient(page, base, "Tester Patient-3", "Dispositivo"),
    markers: (page) => [
      page.getByText(/100245/).first(),
      page.getByText("Pedido", { exact: true }).filter({ visible: true }).first(),
      page.getByText("Recibido", { exact: true }).filter({ visible: true }).first(),
    ],
  },
  calendar: {
    name: "calendar",
    auth: true,
    clip: { x: 192, y: 168, width: 1076, height: 520 },
    run: async (page, { base }) => {
      await page.goto(`${base}/calendar`);
      await page.getByText("Tester Patient-1").first().waitFor();
    },
    markers: (page) => [
      page.getByText(/^(Enero|Febrero|Marzo|Abril|Mayo|Junio|Julio|Agosto|Septiembre|Octubre|Noviembre|Diciembre) de \d{4}$/).first(),
      page.getByText("Mes", { exact: true }).filter({ visible: true }).last(),
      page.getByRole("button", { name: "Hoy" }).first(),
      page.getByText("Tester Patient-1").first(),
      page.locator("button:visible").filter({ has: page.locator("svg") }).last(),
    ],
  },
  panel: {
    name: "panel",
    auth: true,
    clip: { x: 212, y: 84, width: 1040, height: 716 },
    run: async (page, { base }) => {
      await page.goto(`${base}/dashboard`);
      await page.getByText("Requiere tu acción").first().waitFor();
    },
    markers: (page) => [
      page.getByPlaceholder("Buscar paciente"),
      page.getByText("Citas hoy").first(),
      page.getByText("Mis pacientes por etapa").first(),
      page.getByText("Próximas citas").first(),
      page.getByText("Requiere tu acción").first(),
    ],
  },
  qr: {
    name: "qr",
    auth: true,
    clipTo: dialog,
    run: async (page, { base }) => {
      await openPatient(page, base, "Tester Patient-1");
      await page.getByRole("button", { name: "QR para el paciente" }).first().click();
      await dialog(page).getByRole("button", { name: "Copiar enlace" }).waitFor();
      await page.waitForTimeout(800);
    },
    markers: (page) => [
      dialog(page).getByText(/consentimiento informado/i).first(),
      dialog(page).locator("canvas, svg, img").filter({ visible: true }).last(),
      dialog(page).getByRole("button", { name: "Copiar enlace" }),
    ],
  },
};

/**
 * Deck order. `chapter` slides open a chapter; `task` slides show one shot;
 * `faq` slides list questions and answers (content.faq[id]).
 */
export const DECK = [
  { kind: "cover" },
  { kind: "toc" },
  { kind: "chapter", id: "access" },
  { kind: "task", id: "login", shot: "login" },
  { kind: "task", id: "forgot", shot: "forgot" },
  { kind: "task", id: "reset", shot: "reset" },
  { kind: "chapter", id: "patients" },
  { kind: "task", id: "patients", shot: "patients" },
  { kind: "task", id: "patientAdd", shot: "patientAdd" },
  { kind: "task", id: "patientDetail", shot: "patientDetail" },
  { kind: "task", id: "psgFill", shot: "psgFill" },
  { kind: "task", id: "psgResult", shot: "psgResult" },
  { kind: "task", id: "visit", shot: "visit" },
  { kind: "task", id: "qr", shot: "qr" },
  { kind: "task", id: "documents", shot: "documents" },
  { kind: "chapter", id: "device" },
  { kind: "task", id: "order", shot: "order" },
  { kind: "task", id: "tracking", shot: "tracking" },
  { kind: "chapter", id: "calendar" },
  { kind: "task", id: "calendar", shot: "calendar" },
  { kind: "chapter", id: "panel" },
  { kind: "task", id: "panel", shot: "panel" },
  { kind: "chapter", id: "faq" },
  { kind: "faq", id: "faq1" },
  { kind: "faq", id: "faq2" },
];

/** Chapters in table-of-contents order; the ones without slides yet are listed as upcoming. */
export const CHAPTERS = ["access", "patients", "device", "calendar", "panel", "faq"];
