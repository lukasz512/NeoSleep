<template>
  <div class="work-editor" :class="{ 'work-editor--focused': focused }">
    <span v-if="!modelValue && placeholder" class="work-editor__placeholder" aria-hidden="true">{{ placeholder }}</span>
    <EditorContent :editor="editor" class="work-editor__content" />
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref, watch, watchEffect } from "vue";
import { useI18n } from "vue-i18n";
import { Node } from "@tiptap/core";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import { EditorContent, useEditor } from "@tiptap/vue-3";
import { filesFromTransfer } from "../../composables/useWorkAttachments";
import { WORK_IMAGE_SIZES, docToMarkdown, markdownToDoc, type WorkImageAttrs, type WorkImageSize } from "./workMarkdown";

/**
 * The work item description, WYSIWYG over markdown (CORE-195): text stays literal, images show
 * inline where they were pasted. Files pasted or dropped here go to the parent (`files`), which
 * uploads them and calls insertImages() at the caret; `images` maps each ref to a URL to show.
 */
const props = defineProps<{
  modelValue: string;
  /** Ref (attachment id or `pending-<n>`) → URL; a ref without one shows an empty frame. */
  images: Readonly<Record<string, string>>;
  placeholder?: string;
  ariaLabel?: string;
}>();
const emit = defineEmits<{ "update:modelValue": [value: string]; files: [files: File[]]; preview: [ref: string] }>();

const { t } = useI18n();

const focused = ref(false);
/** The last text this editor produced, so a parent echo doesn't reset the caret. */
let emitted = props.modelValue;

const WorkImage = Node.create({
  name: "workImage",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,
  addAttributes() {
    return { ref: { default: "" }, alt: { default: "" }, size: { default: "full" } };
  },
  parseHTML() {
    return [
      {
        tag: "img[data-ref]",
        getAttrs: (el) => ({ ref: el.getAttribute("data-ref") ?? "", alt: el.getAttribute("alt") ?? "", size: el.getAttribute("data-size") ?? "full" }),
      },
    ];
  },
  renderHTML({ node }) {
    return ["img", { "data-ref": node.attrs.ref as string, alt: node.attrs.alt as string, "data-size": node.attrs.size as string }];
  },
  addNodeView() {
    return ({ node, editor: owner, getPos }) => {
      const ref = node.attrs.ref as string;
      const frame = document.createElement("div");
      frame.className = "work-editor__figure";
      frame.dataset.testid = "work-image";
      const img = document.createElement("img");
      img.className = "work-editor__image";
      img.alt = node.attrs.alt as string;
      img.dataset.ref = ref;
      img.addEventListener("dblclick", () => emit("preview", ref));

      // CORE-202: S / M / L / full width, kept in the markdown as the image's title.
      const bar = document.createElement("div");
      bar.className = "work-editor__size-bar";
      const sizeButtons = WORK_IMAGE_SIZES.map((size) => {
        const button = barButton(t(`workBoard.image.size.${size}`), t(`workBoard.image.sizeLabel.${size}`));
        button.dataset.testid = `work-image-size-${size}`;
        button.addEventListener("click", () => {
          const pos = getPos();
          if (typeof pos === "number") owner.view.dispatch(owner.state.tr.setNodeAttribute(pos, "size", size));
        });
        return { size, button };
      });
      const expand = barButton("", t("workBoard.image.expand"));
      expand.dataset.testid = "work-image-expand";
      const icon = document.createElement("i");
      icon.className = "mdi mdi-arrow-expand";
      icon.setAttribute("aria-hidden", "true");
      expand.append(icon);
      expand.addEventListener("click", () => emit("preview", ref));
      bar.append(...sizeButtons.map((entry) => entry.button), expand);
      frame.append(img, bar);

      function showSize(size: WorkImageSize): void {
        frame.dataset.size = size;
        for (const entry of sizeButtons) entry.button.setAttribute("aria-pressed", String(entry.size === size));
      }
      showSize(node.attrs.size as WorkImageSize);

      // The URL arrives later (signing, upload), so it follows `images`.
      const stop = watchEffect(() => {
        const url = props.images[ref];
        if (url) img.src = url;
        else img.removeAttribute("src");
      });
      return {
        dom: frame,
        update: (next) => {
          if (next.type.name !== "workImage" || next.attrs.ref !== ref) return false;
          showSize(next.attrs.size as WorkImageSize);
          return true;
        },
        // Clicks in the bar are the bar's own; ProseMirror would otherwise turn them into a selection.
        stopEvent: (event) => bar.contains(event.target as globalThis.Node),
        ignoreMutation: () => true,
        destroy: stop,
      };
    };
  },
});

function barButton(text: string, label: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "work-editor__size";
  button.textContent = text;
  button.setAttribute("aria-label", label);
  button.title = label;
  // Keeps the editor's selection (and the selected image) while a size is picked.
  button.addEventListener("mousedown", (event) => event.preventDefault());
  return button;
}

const editor = useEditor({
  extensions: [
    // Plain paragraphs only: rich blocks or marks would not survive the markdown round trip.
    StarterKit.configure({
      blockquote: false,
      bold: false,
      bulletList: false,
      code: false,
      codeBlock: false,
      hardBreak: false,
      heading: false,
      horizontalRule: false,
      italic: false,
      link: false,
      listItem: false,
      listKeymap: false,
      orderedList: false,
      strike: false,
      trailingNode: false,
      underline: false,
    }),
    WorkImage,
  ],
  content: markdownToDoc(props.modelValue),
  editorProps: {
    attributes: { role: "textbox", "aria-multiline": "true", ...(props.ariaLabel ? { "aria-label": props.ariaLabel } : {}) },
    handlePaste: (_view, event) => takeFiles(filesFromTransfer(event.clipboardData)),
    handleDrop: (view, event, _slice, moved) => {
      if (moved) return false;
      const files = filesFromTransfer(event.dataTransfer);
      const at = view.posAtCoords({ left: event.clientX, top: event.clientY });
      if (files.length && at) editor.value?.commands.setTextSelection(at.pos);
      return takeFiles(files);
    },
  },
  onUpdate: ({ editor: e }) => {
    emitted = docToMarkdown(e.getJSON());
    emit("update:modelValue", emitted);
  },
  onFocus: () => (focused.value = true),
  onBlur: () => (focused.value = false),
});

function takeFiles(files: File[]): boolean {
  if (!files.length) return false;
  emit("files", files);
  return true;
}

watch(
  () => props.modelValue,
  (value) => {
    if (value === emitted || !editor.value) return;
    emitted = value;
    // An upload finishing re-points an image's ref while the user may still be typing;
    // keep the caret where it was instead of letting setContent reset it (CORE-196).
    const { from, to } = editor.value.state.selection;
    editor.value.commands.setContent(markdownToDoc(value), { emitUpdate: false });
    if (focused.value) {
      const max = editor.value.state.doc.content.size;
      editor.value.commands.setTextSelection({ from: Math.min(from, max), to: Math.min(to, max) });
    }
  },
);

/**
 * Puts images at the caret, each on its own line, and leaves the caret in the text after them
 * (an empty line if none follows); a selected image would be replaced by the next key typed.
 */
function insertImages(images: readonly WorkImageAttrs[]): void {
  if (!editor.value || !images.length) return;
  editor.value
    .chain()
    .focus()
    .insertContent(images.map((attrs) => ({ type: "workImage", attrs })))
    .command(({ tr }) => {
      if (!(tr.selection instanceof NodeSelection)) return true;
      const after = tr.selection.to;
      if (!tr.doc.resolve(after).nodeAfter?.isTextblock) tr.insert(after, tr.doc.type.schema.nodes.paragraph!.create());
      tr.setSelection(TextSelection.create(tr.doc, after + 1));
      return true;
    })
    .run();
}

defineExpose({ insertImages });
onBeforeUnmount(() => editor.value?.destroy());
</script>

<style scoped>
/* Looks like the outlined text fields around it (form controls are quiet, NEO-89). */
.work-editor {
  position: relative;
  min-height: 112px;
  padding: 12px 16px;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 4px;
  transition: border-color 0.15s ease;
}

.work-editor:hover {
  border-color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
}

.work-editor--focused {
  border-color: rgb(var(--v-theme-primary));
  box-shadow: inset 0 0 0 1px rgb(var(--v-theme-primary));
}

.work-editor__placeholder {
  position: absolute;
  inset: 12px 16px auto;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  pointer-events: none;
}

.work-editor__content :deep(.ProseMirror) {
  min-height: 88px;
  outline: none;
  white-space: pre-wrap;
  word-break: break-word;
}

.work-editor__content :deep(p) {
  margin: 0;
}

.work-editor__content :deep(.work-editor__figure) {
  position: relative;
  width: fit-content;
  max-width: 100%;
  margin: 8px 0;
}

/* CORE-202: each size is a cap; a small screenshot never grows past its own pixels. */
.work-editor__content :deep(.work-editor__figure[data-size="s"]) {
  max-width: min(240px, 100%);
}

.work-editor__content :deep(.work-editor__figure[data-size="m"]) {
  max-width: min(400px, 100%);
}

.work-editor__content :deep(.work-editor__figure[data-size="l"]) {
  max-width: min(640px, 100%);
}

.work-editor__content :deep(.work-editor__image) {
  display: block;
  max-width: 100%;
  min-width: 48px;
  min-height: 48px;
  border-radius: 8px;
  background: rgba(var(--v-theme-on-surface), 0.06);
}

.work-editor__content :deep(.work-editor__figure.ProseMirror-selectednode .work-editor__image) {
  outline: 2px solid rgb(var(--v-theme-primary));
}

.work-editor__content :deep(.work-editor__size-bar) {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  gap: 4px;
  padding: 4px;
  border-radius: 8px;
  background: rgba(var(--v-theme-surface), 0.92);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s ease;
}

.work-editor__content :deep(.work-editor__figure:hover .work-editor__size-bar),
.work-editor__content :deep(.work-editor__figure.ProseMirror-selectednode .work-editor__size-bar) {
  opacity: 1;
  pointer-events: auto;
}

/* No hover on a phone: the bar stays visible. */
@media (hover: none) {
  .work-editor__content :deep(.work-editor__size-bar) {
    opacity: 1;
    pointer-events: auto;
  }
}

.work-editor__content :deep(.work-editor__size) {
  min-width: 32px;
  height: 32px;
  padding: 0 8px;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 600;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  cursor: pointer;
}

.work-editor__content :deep(.work-editor__size:hover) {
  background: rgba(var(--v-theme-on-surface), 0.08);
}

.work-editor__content :deep(.work-editor__size[aria-pressed="true"]) {
  color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.12);
}
</style>
