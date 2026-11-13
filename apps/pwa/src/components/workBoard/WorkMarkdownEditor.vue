<template>
  <div class="work-editor" :class="{ 'work-editor--focused': focused }">
    <span v-if="!modelValue && placeholder" class="work-editor__placeholder" aria-hidden="true">{{ placeholder }}</span>
    <EditorContent :editor="editor" class="work-editor__content" />
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref, watch, watchEffect } from "vue";
import { Node } from "@tiptap/core";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import { EditorContent, useEditor } from "@tiptap/vue-3";
import { filesFromTransfer } from "../../composables/useWorkAttachments";
import { docToMarkdown, markdownToDoc, type WorkImageAttrs } from "./workMarkdown";

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
const emit = defineEmits<{ "update:modelValue": [value: string]; files: [files: File[]] }>();

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
    return { ref: { default: "" }, alt: { default: "" } };
  },
  parseHTML() {
    return [{ tag: "img[data-ref]", getAttrs: (el) => ({ ref: el.getAttribute("data-ref") ?? "", alt: el.getAttribute("alt") ?? "" }) }];
  },
  renderHTML({ node }) {
    return ["img", { "data-ref": node.attrs.ref as string, alt: node.attrs.alt as string }];
  },
  addNodeView() {
    return ({ node }) => {
      const img = document.createElement("img");
      img.className = "work-editor__image";
      img.alt = node.attrs.alt as string;
      img.dataset.ref = node.attrs.ref as string;
      const ref = node.attrs.ref as string;
      // The URL arrives later (signing, upload), so it follows `images`.
      const stop = watchEffect(() => {
        const url = props.images[ref];
        if (url) img.src = url;
        else img.removeAttribute("src");
      });
      return {
        dom: img,
        update: (next) => next.type.name === "workImage" && next.attrs.ref === ref,
        destroy: stop,
      };
    };
  },
});

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
    editor.value.commands.setContent(markdownToDoc(value), { emitUpdate: false });
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

.work-editor__content :deep(.work-editor__image) {
  display: block;
  max-width: 100%;
  min-width: 48px;
  min-height: 48px;
  margin: 8px 0;
  border-radius: 8px;
  background: rgba(var(--v-theme-on-surface), 0.06);
}

.work-editor__content :deep(.work-editor__image.ProseMirror-selectednode) {
  outline: 2px solid rgb(var(--v-theme-primary));
}
</style>
