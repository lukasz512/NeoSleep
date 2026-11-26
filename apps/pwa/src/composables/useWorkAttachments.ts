/**
 * Screenshots and PDFs on a work item (CORE-192, docs/stories/work-board-task-form-attachments.md).
 * The checks mirror the API's (image/* or PDF, ≤ 10 MB) so a wrong file never leaves the device;
 * the API checks again. Files picked before the item exists wait here and upload after Create.
 */
import { onBeforeUnmount, ref } from "vue";

export const WORK_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
export const WORK_ATTACHMENT_ACCEPT = "image/*,application/pdf";

export type AttachmentRejection = "type" | "size";

export function attachmentRejection(file: File): AttachmentRejection | null {
  if (!/^image\/[a-z0-9.+-]+$/.test(file.type) && file.type !== "application/pdf") return "type";
  if (file.size < 1 || file.size > WORK_ATTACHMENT_MAX_BYTES) return "size";
  return null;
}

export function isImage(mimeType: string): boolean {
  return mimeType.startsWith("image/");
}

/** Files from a paste or drop; a pasted screenshot has no useful name, so it gets one. */
export function filesFromTransfer(data: DataTransfer | null): File[] {
  if (!data) return [];
  const files = Array.from(data.files);
  if (files.length) return files.map(namePasted);
  return Array.from(data.items)
    .filter((entry) => entry.kind === "file")
    .map((entry) => entry.getAsFile())
    .filter((file): file is File => file !== null)
    .map(namePasted);
}

function namePasted(file: File): File {
  if (file.name && file.name !== "image.png") return file;
  const ext = file.type.split("/")[1]?.replace(/[^a-z0-9]/g, "") || "png";
  const stamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, "");
  return new File([file], `screenshot-${stamp}.${ext}`, { type: file.type });
}

export interface PendingAttachment {
  id: number;
  file: File;
  /** An object URL for the thumbnail; null for a PDF. */
  preview: string | null;
}

/** A queue of local files with thumbnails; object URLs are released on remove and unmount. */
export function usePendingAttachments() {
  const pending = ref<PendingAttachment[]>([]);
  const rejected = ref<AttachmentRejection | null>(null);
  let nextId = 1;

  /** Queues the acceptable files and returns them; `rejected` says why any were left out. */
  function add(files: readonly File[]): PendingAttachment[] {
    rejected.value = null;
    const added: PendingAttachment[] = [];
    for (const file of files) {
      const reason = attachmentRejection(file);
      if (reason) {
        rejected.value = reason;
        continue;
      }
      added.push({ id: nextId++, file, preview: isImage(file.type) ? URL.createObjectURL(file) : null });
    }
    pending.value.push(...added);
    return added;
  }

  function remove(id: number): void {
    const entry = pending.value.find((p) => p.id === id);
    if (entry?.preview) URL.revokeObjectURL(entry.preview);
    pending.value = pending.value.filter((p) => p.id !== id);
  }

  function clear(): void {
    for (const entry of pending.value) if (entry.preview) URL.revokeObjectURL(entry.preview);
    pending.value = [];
    rejected.value = null;
  }

  onBeforeUnmount(clear);

  return { pending, rejected, add, remove, clear };
}
