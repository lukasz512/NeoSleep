import { describe, it, expect } from "vitest";
import { attachmentRefs, docToMarkdown, imageMarkdown, markdownToDoc, rewriteAttachmentRefs } from "./workMarkdown";

/** The description editor stores markdown; images are `![name](attachment:<id>)` lines (CORE-195). */
describe("work item markdown", () => {
  const TEXT = "Paste does nothing.\n\n![bug.png](attachment:att-1)\nSteps: **open**, paste — literal markdown stays text.";

  it("round-trips text, blank lines and image lines unchanged", () => {
    expect(docToMarkdown(markdownToDoc(TEXT))).toBe(TEXT);
    expect(docToMarkdown(markdownToDoc(""))).toBe("");
  });

  it("makes a whole-line image an image node and leaves an inline one as text", () => {
    const doc = markdownToDoc("see ![a](attachment:x) here\n![b](attachment:y)");
    expect(doc.content.map((block) => block.type)).toEqual(["paragraph", "workImage"]);
    expect(doc.content[1]!.attrs).toEqual({ ref: "y", alt: "b", size: "full" });
  });

  it("lists the attachments the text shows", () => {
    expect([...attachmentRefs(TEXT)]).toEqual(["att-1"]);
    expect([...attachmentRefs("![a](attachment:pending-2)\n![b](https://x.test/b.png)")]).toEqual(["pending-2"]);
    expect(attachmentRefs(null).size).toBe(0);
  });

  it("points placeholders at the uploaded attachments", () => {
    expect(rewriteAttachmentRefs("![a](attachment:pending-1)\n![b](attachment:pending-2)", { "pending-1": "uuid-1" })).toBe(
      "![a](attachment:uuid-1)\n![b](attachment:pending-2)",
    );
  });

  it("keeps an image's size as its title and leaves full width without one (CORE-202)", () => {
    const sized = "![a](attachment:x \"s\")\n![b](attachment:y \"l\")\n![c](attachment:z)";
    expect(markdownToDoc(sized).content.map((block) => block.attrs?.size)).toEqual(["s", "l", "full"]);
    expect(docToMarkdown(markdownToDoc(sized))).toBe(sized);
    expect(imageMarkdown("x", "a", "m")).toBe('![a](attachment:x "m")');
    expect(imageMarkdown("x", "a", "full")).toBe("![a](attachment:x)");
    expect([...attachmentRefs(sized)]).toEqual(["x", "y", "z"]);
    expect(rewriteAttachmentRefs('![a](attachment:pending-1 "m")', { "pending-1": "uuid-1" })).toBe('![a](attachment:uuid-1 "m")');
  });

  it("writes a name that can't break the markdown", () => {
    expect(imageMarkdown("x", "shot [1]\n.png")).toBe("![shot 1.png](attachment:x)");
  });
});
