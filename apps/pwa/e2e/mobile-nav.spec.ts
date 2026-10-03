import { test, expect, type Page } from "@playwright/test";

/**
 * Real-browser guard for the NEO-161 "Kropla" phone menu, on all three
 * engines. Uses e2e/harness/mobile-nav.html (Vite dev only, no API/DB) — the
 * real AppShell and account menu over a long feed. What only a real layout
 * engine can tell us:
 *
 * - "Close" is exactly where "More" was (the row never re-flows)
 * - collapsed, the pill's buttons sit in its row; open, they are grid
 *   positions 1–4 (top left) with the other modules after them
 * - "More" grows one box: the module grid opens above the row, inside it
 * - the pill floats over the content, and the last card scrolls clear of it
 * - the account avatar grows into the card corner with the content inset
 */

// The first visit compiles the whole shell + account menu on the dev server
// (~40 s cold), longer than Playwright's default 30 s per test.
test.describe.configure({ timeout: 90_000 });

async function open(page: Page, query = "") {
  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto(`/e2e/harness/mobile-nav.html${query}`);
  await expect(page.locator(".mobile-nav-panel__items")).toBeVisible();
}

const toggle = (page: Page) => page.locator(".mobile-nav-panel__toggle");
const box = async (page: Page, selector: string) => (await page.locator(selector).first().boundingBox())!;

const centre = (b: { x: number; y: number; width: number; height: number }) => [b.x + b.width / 2, b.y + b.height / 2];
const primaryLinks = (page: Page) => page.locator(".mobile-nav-panel__cell--primary .mobile-bottom-nav-item");

test("collapsed: the pill's four buttons sit in its row, evenly spaced up to the More slot", async ({ page }) => {
  await open(page);
  const [, ty] = centre((await toggle(page).boundingBox())!);
  const xs: number[] = [];
  for (const link of await primaryLinks(page).all()) {
    const [x, y] = centre((await link.boundingBox())!);
    expect(Math.abs(y - ty)).toBeLessThan(2);
    xs.push(x);
  }
  const [tx] = centre((await toggle(page).boundingBox())!);
  const steps = [...xs, tx].slice(1).map((x, i) => x - [...xs, tx][i]);
  for (const s of steps) expect(Math.abs(s - steps[0])).toBeLessThan(2);
});

const labelLines = (el: HTMLElement | SVGElement) => {
  const style = getComputedStyle(el);
  const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2;
  return Math.round(el.getBoundingClientRect().height / lineHeight);
};

// CORE-91: English "Appointments" showed as "Appointment" / "s" in the pill.
test("collapsed: long module names stay on one line in the pill's row", async ({ page }) => {
  await open(page, "?labels=long");
  for (const label of await page.locator(".mobile-nav-panel__cell--primary .mobile-bottom-nav-item__label").all()) {
    expect(await label.evaluate(labelLines)).toBe(1);
  }
});

test("open: the module grid still allows a long name a second line", async ({ page }) => {
  await open(page, "?labels=long");
  await toggle(page).click();
  const label = page.locator(".mobile-nav-panel__cell--primary .mobile-bottom-nav-item__label", { hasText: "Appointments" });
  await expect.poll(() => label.evaluate((el) => getComputedStyle(el).getPropertyValue("-webkit-line-clamp"))).toBe("2");
});

test("Close sits exactly where More was, and the box grows upwards over the grid", async ({ page }) => {
  await open(page);
  const more = (await toggle(page).boundingBox())!;
  await toggle(page).click();
  await expect(toggle(page)).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator(".mobile-nav-panel__sheet")).toBeVisible();
  // let the spring settle before measuring
  await page.waitForTimeout(600);
  const close = (await toggle(page).boundingBox())!;
  expect(Math.abs(close.x - more.x)).toBeLessThan(1);
  expect(Math.abs(close.y - more.y)).toBeLessThan(1);
  const sheet = await box(page, ".mobile-nav-panel__sheet");
  const row = await box(page, ".mobile-nav-panel__items");
  const glass = await box(page, ".mobile-nav-panel__glass");
  expect(sheet.y + sheet.height).toBeLessThanOrEqual(row.y + 1);
  // one box: the glass spans the grid and the row
  expect(glass.y).toBeLessThanOrEqual(sheet.y);
  expect(glass.y + glass.height).toBeGreaterThanOrEqual(row.y + row.height - 1);
  // the pill's buttons rose into grid positions 1–4: one row, top left first
  const firstOverflow = await box(page, ".mobile-nav-panel__cell--overflow");
  const tops = [];
  for (const cell of await page.locator(".mobile-nav-panel__cell--primary").all()) tops.push((await cell.boundingBox())!);
  expect(tops[0].x).toBeLessThan(tops[1].x);
  for (const t of tops) {
    expect(Math.abs(t.y - tops[0].y)).toBeLessThan(1);
    expect(t.y).toBeLessThan(firstOverflow.y);
  }
  expect(Math.abs(firstOverflow.x - tops[0].x)).toBeLessThan(1);

  await toggle(page).click();
  await expect(toggle(page)).toHaveAttribute("aria-expanded", "false");
});

test("the pill floats over the page, and the last card scrolls clear of it", async ({ page }) => {
  await open(page);
  const pill = await box(page, ".mobile-nav-panel__items");
  expect(pill.x).toBeGreaterThan(0);
  expect(pill.y + pill.height).toBeLessThan(780);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const last = await box(page, ".harness-card:last-child");
  const pillAfter = await box(page, ".mobile-nav-panel__items");
  expect(last.y + last.height).toBeLessThanOrEqual(pillAfter.y);
});

test("the account avatar grows into the card's top-right corner, inset like the card's content", async ({ page }) => {
  await open(page);
  await page.locator(".harness-avatar-btn").click();
  await expect(page.getByRole("dialog", { name: "User menu" })).toBeVisible();
  // Wait for the grow motion to land: the menu is open, the avatar has no
  // running transition and its box holds still. (A fixed 800ms delay raced it
  // on WebKit CI; the avatar also sits still at scale(0.6) before the open
  // class lands, so stillness alone isn't enough.)
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const el = document.querySelector('.account-menu__card [data-motion="avatar"]');
        if (!el?.closest(".account-menu--open")) return false;
        if (el.getAnimations().some((a) => a.playState === "running")) return false;
        const read = () => JSON.stringify(el.getBoundingClientRect());
        const before = read();
        await new Promise((r) => setTimeout(r, 100));
        return before === read();
      }),
    )
    .toBe(true);
  const card = await box(page, ".account-menu__card");
  const avatar = await box(page, '.account-menu__card [data-motion="avatar"]');
  expect(Math.abs(avatar.width - 56)).toBeLessThan(1);
  expect(Math.abs(card.x + card.width - (avatar.x + avatar.width) - 16)).toBeLessThan(1.5);
  expect(Math.abs(avatar.y - card.y - 16)).toBeLessThan(1.5);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "User menu" })).toHaveCount(0);
});
