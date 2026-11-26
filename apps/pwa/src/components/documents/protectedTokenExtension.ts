import { Node, mergeAttributes } from "@tiptap/core";

/**
 * Tiptap atomic inline node for the `{legalEntityName}`/`{company}`-style
 * single-curly-brace params documentRender.ts's fillContentParams()
 * substitutes into saved document content (see
 * docs/stories/document-content-editor.md and packages/documents/src/
 * documentRender.ts's own comment on this mechanism). Rendered bold +
 * distinct-colored per Łukasz's own proposed solution ("te miejsca do
 * podmiany mysle ze zwykle {{ }} w odmiennym pogrubionym kolorze zalatwia
 * wszystko"), and atomic/unselectable-inside so an admin can move or delete
 * the whole token but never edit its wording character-by-character.
 *
 * Round-trip contract (both directions are plain string transforms, not
 * Tiptap parse/serialize alone — see htmlToEditorHtml/editorHtmlToPlainHtml
 * below):
 *   load:  content_html's literal "{name}" substrings are wrapped into
 *          `<span data-protected-token="name">{name}</span>` BEFORE being
 *          handed to editor.commands.setContent() — Tiptap's own HTML
 *          parser only ever recognizes real elements, never bare text
 *          patterns, so this wrapping has to happen first.
 *   save:  editor.getHTML() renders each node back to that same span
 *          shape (renderHTML below) — editorHtmlToPlainHtml() then strips
 *          the span but keeps its literal "{name}" text, independent of
 *          whatever the backend's own sanitizer allowlist happens to be
 *          configured as (apps/api/src/commands/documentContent.ts) — the
 *          frontend must not depend on a same-implementation-detail
 *          coincidence to keep the contract "content_html always stores
 *          plain {name} text" true.
 */

export const PROTECTED_TOKEN_ATTR = "data-protected-token";

export interface ProtectedTokenOptions {
  HTMLAttributes: Record<string, unknown>;
}

const ProtectedToken = Node.create<ProtectedTokenOptions>({
  name: "protectedToken",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addOptions() {
    return { HTMLAttributes: {} };
  },

  addAttributes() {
    return {
      token: {
        default: null,
        parseHTML: (element) => element.getAttribute(PROTECTED_TOKEN_ATTR),
        renderHTML: (attributes) => ({ [PROTECTED_TOKEN_ATTR]: attributes.token as string }),
      },
    };
  },

  parseHTML() {
    return [{ tag: `span[${PROTECTED_TOKEN_ATTR}]` }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const token = node.attrs.token as string;
    return ["span", mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), `{${token}}`];
  },
});

export default ProtectedToken;

/** Matches a single {name}-style token — same identifier shape fillContentParams' callers use (legalEntityName, company, ...): starts with a letter/underscore, then letters/digits/underscores. */
const TOKEN_PATTERN = /\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g;

/**
 * Wraps every literal {name} occurrence in raw content_html as a
 * recognizable protectedToken span, so Tiptap's HTML parser turns each one
 * into the atomic node when the editor loads this content. Safe to run
 * across the whole string unconditionally: saved content_html never
 * contains HTML attributes (the backend sanitizer strips all of them — see
 * SANITIZE_OPTIONS in commands/documentContent.ts), so a "{name}" substring
 * can never legitimately appear inside a tag, only in text content.
 */
export function htmlToEditorHtml(contentHtml: string): string {
  return contentHtml.replace(TOKEN_PATTERN, (_match, name: string) => `<span ${PROTECTED_TOKEN_ATTR}="${name}">{${name}}</span>`);
}

/**
 * Inverse of htmlToEditorHtml, applied to editor.getHTML()'s output before
 * it's sent to the backend — strips the protectedToken span wrapper but
 * keeps its literal "{name}" text, so content_html in storage is always
 * plain text with literal {name} substrings, exactly as fillContentParams
 * expects, regardless of the backend sanitizer's own configuration.
 */
export function editorHtmlToPlainHtml(editorHtml: string): string {
  const spanPattern = new RegExp(`<span[^>]*${PROTECTED_TOKEN_ATTR}="[^"]*"[^>]*>(.*?)</span>`, "g");
  return editorHtml.replace(spanPattern, "$1");
}
