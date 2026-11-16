/**
 * The work item description as markdown (CORE-195). The editor shows it WYSIWYG, but only images
 * are rich: a line that is just `![name](attachment:<id>)` is an image node, every other line is a
 * paragraph of literal text, so whatever markdown was typed or imported survives a round trip.
 * `<id>` is a work attachment's id, or `pending-<n>` for a pasted file that hasn't uploaded yet.
 * An image shown smaller than full width carries its size as the title: `![name](attachment:<id> "m")`
 * (CORE-202), so the size travels with the text and everyone sees the same layout.
 */
export const WORK_IMAGE_SIZES = ["s", "m", "l", "full"] as const;
export type WorkImageSize = (typeof WORK_IMAGE_SIZES)[number];

export type WorkImageAttrs = {
  ref: string;
  alt: string;
  size?: WorkImageSize;
};

export interface WorkDocBlock {
  type: "paragraph" | "workImage";
  attrs?: WorkImageAttrs;
  content?: { type: "text"; text: string }[];
}

export interface WorkDoc {
  type: "doc";
  content: WorkDocBlock[];
}

const IMAGE_LINE = /^!\[([^\]\n]*)\]\(attachment:([A-Za-z0-9-]+)(?: "(s|m|l)")?\)$/;
const IMAGE_REF = /!\[[^\]\n]*\]\(attachment:([A-Za-z0-9-]+)(?: "(?:s|m|l)")?\)/g;

function isImageSize(value: unknown): value is WorkImageSize {
  return typeof value === "string" && (WORK_IMAGE_SIZES as readonly string[]).includes(value);
}

export function markdownToDoc(text: string): WorkDoc {
  return {
    type: "doc",
    content: text.split("\n").map((line): WorkDocBlock => {
      const image = IMAGE_LINE.exec(line);
      if (image) return { type: "workImage", attrs: { ref: image[2]!, alt: image[1]!, size: (image[3] as WorkImageSize | undefined) ?? "full" } };
      return line ? { type: "paragraph", content: [{ type: "text", text: line }] } : { type: "paragraph" };
    }),
  };
}

/** Accepts the editor's getJSON(); marks and unknown nodes are reduced to their text. */
export function docToMarkdown(doc: { content?: readonly { type?: string; attrs?: Record<string, unknown>; content?: readonly { text?: string }[] }[] }): string {
  return (doc.content ?? [])
    .map((block) =>
      block.type === "workImage"
        ? imageMarkdown(String(block.attrs?.ref ?? ""), String(block.attrs?.alt ?? ""), isImageSize(block.attrs?.size) ? block.attrs.size : "full")
        : (block.content ?? []).map((inline) => inline.text ?? "").join(""),
    )
    .join("\n");
}

/** The image line for an attachment; brackets and line breaks are dropped from the name. */
export function imageMarkdown(ref: string, alt: string, size: WorkImageSize = "full"): string {
  return `![${alt.replace(/[[\]\n]/g, "")}](attachment:${ref}${size === "full" ? "" : ` "${size}"`})`;
}

/** The attachment ids the text shows as images. */
export function attachmentRefs(text: string | null): Set<string> {
  return new Set(Array.from((text ?? "").matchAll(IMAGE_REF), (match) => match[1]!));
}

/** Re-points image refs, e.g. `pending-1` → the uploaded attachment's id. */
export function rewriteAttachmentRefs(text: string, ids: Readonly<Record<string, string>>): string {
  return text.replace(IMAGE_REF, (whole, ref: string) => (ids[ref] ? whole.replace(`attachment:${ref}`, `attachment:${ids[ref]}`) : whole));
}
