import { describe, it, expect, beforeEach } from "vitest";
import { HERO_NAMES, findHeroRow, recordHeaderReady, tagHeroRecord, tagHeroRow, untagHero, waitFor, type HeroTags } from "./pageTransitionHero";

/* jsdom has no layout: a row counts as on screen when it reports a client rect. */
function visible(el: Element) {
  (el as HTMLElement).getClientRects = () => [{}] as unknown as DOMRectList;
}

const vtName = (el: Element | null) => (el as HTMLElement | null)?.style.viewTransitionName ?? "";

describe("pageTransitionHero (NEO-97 row → record)", () => {
  let tags: HeroTags;
  beforeEach(() => {
    tags = { elements: [] };
    document.body.innerHTML = `
      <table><tbody>
        <tr data-page-hero-key="p1"><td><span class="app-avatar">ML</span><span data-page-hero-name>María López</span></td>
          <td><span class="app-avatar">PR</span><span data-page-hero-name>Dr. Ruiz</span></td></tr>
        <tr data-page-hero-key="p2"><td><span class="app-avatar">JC</span><span data-page-hero-name>Jorge Castillo</span></td></tr>
      </tbody></table>
      <div class="feed"><div data-page-hero-key="p1"><span class="app-avatar">ML</span><div data-page-hero-name>María</div></div></div>`;
  });

  it("tags only the visible row's first avatar and name — not the doctor cell, not the hidden phone card", () => {
    const row = document.querySelector("tr[data-page-hero-key='p1']")!;
    visible(row);
    expect(findHeroRow(document, "p1")).toBe(row);
    expect(tagHeroRow(document, "p1", tags)).toBe(true);
    const [avatar, doctorAvatar] = row.querySelectorAll(".app-avatar");
    expect(vtName(avatar)).toBe(HERO_NAMES.avatar);
    expect(vtName(row.querySelector("[data-page-hero-name]"))).toBe(HERO_NAMES.name);
    expect(vtName(doctorAvatar)).toBe("");
    expect(vtName(document.querySelector(".feed .app-avatar"))).toBe("");
  });

  it("no row on screen (other page, filtered out) means no hero", () => {
    expect(tagHeroRow(document, "p1", tags)).toBe(false);
    expect(tagHeroRow(document, "missing", tags)).toBe(false);
    expect(tags.elements).toHaveLength(0);
  });

  it("tags the record header once it shows the record, and untags everything after", () => {
    document.body.innerHTML = `<header class="view-item__record-header"><span class="view-item__record-title-skeleton"></span></header>`;
    expect(recordHeaderReady(document)).toBe(false);
    document.body.innerHTML = `
      <header class="view-item__record-header">
        <span class="app-avatar">ML</span>
        <h1 class="view-item__record-title">María López</h1>
        <div class="view-item__record-details">F · 46 y</div>
      </header>`;
    expect(recordHeaderReady(document)).toBe(true);
    expect(tagHeroRecord(document, tags)).toBe(true);
    expect(vtName(document.querySelector(".view-item__record-title"))).toBe(HERO_NAMES.name);
    expect(vtName(document.querySelector(".view-item__record-details"))).toBe(HERO_NAMES.details);
    untagHero(tags);
    expect(vtName(document.querySelector(".app-avatar"))).toBe("");
    expect(tags.elements).toHaveLength(0);
  });

  it("waitFor gives up after its cap so a slow record never holds the page", async () => {
    expect(await waitFor(() => true, 0)).toBe(true);
    expect(await waitFor(() => false, 20)).toBe(false);
  });
});
