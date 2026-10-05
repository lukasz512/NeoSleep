/**
 * Doctor user guide — structure (language-neutral). Texts live in
 * content/<locale>.json under the same ids; screenshots in shots/<locale>/.
 *
 * Each task slide names one shot. A shot is a recipe: where to go, what to
 * do before the picture, and which elements get a numbered marker. Marker
 * N on the picture is step N in the slide's text.
 */

/** @typedef {import("playwright").Page} Page */
/** @typedef {{ name: string, auth: boolean, clip?: { x: number, y: number, width: number, height: number }, run: (page: Page, ctx: { base: string }) => Promise<void>, markers: (page: Page) => import("playwright").Locator[] }} Shot */

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
};

/**
 * Deck order. `chapter` slides open a chapter; `task` slides show one shot;
 * `text` slides carry text only (FAQ, quotes).
 */
export const DECK = [
  { kind: "cover" },
  { kind: "toc" },
  { kind: "chapter", id: "access" },
  { kind: "task", id: "login", shot: "login" },
  { kind: "task", id: "forgot", shot: "forgot" },
  { kind: "task", id: "reset", shot: "reset" },
];

/** Chapters in table-of-contents order; the ones without slides yet are listed as upcoming. */
export const CHAPTERS = ["access", "patients", "device", "calendar", "panel", "faq"];
