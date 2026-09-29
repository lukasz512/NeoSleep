import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  HERO_ANGLE_VAR,
  HERO_NAMES,
  findHeroRow,
  heroAngle,
  recordHeaderReady,
  resetHero,
  tagHeroRecord,
  tagHeroRow,
  untagHero,
  waitFor,
  type HeroTags,
} from "./pageTransitionHero";
import { HERO_WAIT_MS } from "./pageTransitions";

/* jsdom has no layout: a row counts as on screen when it reports a client rect. */
function visible(el: Element) {
  (el as HTMLElement).getClientRects = () => [{}] as unknown as DOMRectList;
}
function placeAt(el: Element | null, x: number, y: number, size = 32) {
  (el as HTMLElement).getBoundingClientRect = () => ({ left: x, top: y, width: size, height: size, right: x + size, bottom: y + size, x, y, toJSON: () => ({}) }) as DOMRect;
}

const vtName = (el: Element | null) => (el as HTMLElement | null)?.style.viewTransitionName ?? "";

describe("pageTransitionHero (NEO-97 row → record, NEO-152 the drop)", () => {
  let tags: HeroTags;
  beforeEach(() => {
    tags = { elements: [] };
    document.documentElement.style.removeProperty(HERO_ANGLE_VAR);
    document.body.innerHTML = `
      <table><tbody>
        <tr data-page-hero-key="p1"><td><span class="app-avatar"><span class="app-avatar__initials">ML</span></span><span data-page-hero-name>María López</span></td>
          <td><span class="app-avatar">PR</span><span data-page-hero-name>Dr. Ruiz</span></td></tr>
        <tr data-page-hero-key="p2"><td><span class="app-avatar">JC</span><span data-page-hero-name>Jorge Castillo</span></td></tr>
      </tbody></table>
      <div class="feed"><div data-page-hero-key="p1"><span class="app-avatar">ML</span><div data-page-hero-name>María</div></div></div>`;
  });

  it("tags only the visible row's first avatar and its initials — not the name, not the doctor cell, not the hidden phone card", () => {
    const row = document.querySelector("tr[data-page-hero-key='p1']")!;
    visible(row);
    expect(findHeroRow(document, "p1")).toBe(row);
    expect(tagHeroRow(document, "p1", tags)).toBe(true);
    const [avatar, doctorAvatar] = row.querySelectorAll(".app-avatar");
    expect(vtName(avatar)).toBe(HERO_NAMES.avatar);
    expect(vtName(avatar.querySelector(".app-avatar__initials"))).toBe(HERO_NAMES.initials);
    // NEO-152: the name no longer flies (its growing box read as the font scaling).
    expect(vtName(row.querySelector("[data-page-hero-name]"))).toBe("");
    expect(vtName(doctorAvatar)).toBe("");
    expect(vtName(document.querySelector(".feed .app-avatar"))).toBe("");
  });

  it("no row on screen (other page, filtered out) means no hero", () => {
    expect(tagHeroRow(document, "p1", tags)).toBe(false);
    expect(tagHeroRow(document, "missing", tags)).toBe(false);
    expect(tags.elements).toHaveLength(0);
  });

  it("tags the record header once it shows the record — the name and identity line only to fade — and untags everything after", () => {
    document.body.innerHTML = `<header class="view-item__record-header"><span class="view-item__record-title-skeleton"></span></header>`;
    expect(recordHeaderReady(document)).toBe(false);
    document.body.innerHTML = `
      <header class="view-item__record-header">
        <span class="app-avatar"><span class="app-avatar__initials">ML</span></span>
        <h1 class="view-item__record-title">María López</h1>
        <div class="view-item__record-details">F · 46 y</div>
      </header>`;
    expect(recordHeaderReady(document)).toBe(true);
    expect(tagHeroRecord(document, tags)).toBe(true);
    expect(vtName(document.querySelector(".app-avatar__initials"))).toBe(HERO_NAMES.initials);
    expect(vtName(document.querySelector(".view-item__record-title"))).toBe(HERO_NAMES.title);
    expect(vtName(document.querySelector(".view-item__record-details"))).toBe(HERO_NAMES.details);
    untagHero(tags);
    expect(vtName(document.querySelector(".app-avatar"))).toBe("");
    expect(tags.elements).toHaveLength(0);
  });

  it("sets the flight's angle from the old avatar to the new one, and forgets it on reset", () => {
    const row = document.querySelector("tr[data-page-hero-key='p1']")!;
    visible(row);
    placeAt(row.querySelector(".app-avatar"), 100, 300);
    tagHeroRow(document, "p1", tags);
    untagHero(tags); // between the two ends, as pageTransitions does
    document.body.insertAdjacentHTML("beforeend", `<header class="view-item__record-header"><span class="app-avatar" id="to"></span><h1 class="view-item__record-title">M</h1></header>`);
    placeAt(document.getElementById("to"), 100, 100);
    tagHeroRecord(document, tags);
    // straight up: -90°
    expect(document.documentElement.style.getPropertyValue(HERO_ANGLE_VAR)).toBe("-90deg");
    resetHero(tags);
    expect(document.documentElement.style.getPropertyValue(HERO_ANGLE_VAR)).toBe("");
    expect(tags.origin).toBeUndefined();
  });

  it("heroAngle points along the flight", () => {
    expect(heroAngle({ x: 0, y: 0 }, { x: 10, y: 0 })).toBe(0);
    expect(heroAngle({ x: 0, y: 0 }, { x: 0, y: 10 })).toBe(90);
    expect(heroAngle({ x: 0, y: 0 }, { x: -10, y: 0 })).toBe(180);
  });

  it("waitFor gives up after its cap so a slow record never holds the page", async () => {
    expect(await waitFor(() => true, 0)).toBe(true);
    expect(await waitFor(() => false, 20)).toBe(false);
  });

  it("NEO-152: the frozen wait for the record header is capped at 120 ms", () => {
    expect(HERO_WAIT_MS).toBe(120);
  });
});

describe("page-transitions.css (NEO-152)", () => {
  const css = readFileSync(path.resolve(__dirname, "../assets/page-transitions.css"), "utf-8");

  it("the avatar travels as a drop: stretched along its angle, settling into a circle", () => {
    expect(css).toMatch(/::view-transition-image-pair\(pwa-hero-avatar\) \{\s*animation: pwa-hero-drop 520ms/);
    expect(css).toMatch(/@keyframes pwa-hero-drop \{[\s\S]*rotate\(var\(--pwa-hero-angle, 0deg\)\) scale\(1\.22, 0\.84\)/);
  });

  it("the initials go out to nothing first and come back only after the drop lands", () => {
    expect(css).toMatch(/::view-transition-old\(pwa-hero-initials\) \{\s*animation: pwa-page-fade-out 100ms linear both;/);
    expect(css).toMatch(/::view-transition-new\(pwa-hero-initials\) \{\s*animation: pwa-page-fade-in 180ms linear 400ms both;/);
  });

  it("the name only fades in — nothing flies or scales it", () => {
    expect(css).not.toContain("pwa-hero-name");
    expect(css).toMatch(/::view-transition-new\(pwa-hero-title\) \{\s*animation: pwa-page-fade-in 220ms linear 320ms both;/);
  });

  it("the new page starts while the old one is still fading (no blank sheet)", () => {
    const starts = [...css.matchAll(/pwa-page-fade-in \d+ms var\(--pwa-page-ease-in\) (\d+)ms/g)].map((m) => Number(m[1]));
    const ends = [...css.matchAll(/::view-transition-old\(pwa-page\) \{\s*animation: pwa-page-fade-out (\d+)ms/g)].map((m) => Number(m[1]));
    expect(starts.length).toBeGreaterThan(0);
    expect(Math.max(...starts)).toBeLessThan(Math.min(...ends));
  });
});
