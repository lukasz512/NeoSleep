import { describe, it, expect, vi, beforeAll } from "vitest";
import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";
import { WORK_ATTACHMENT_MAX_BYTES, attachmentRejection, filesFromTransfer, usePendingAttachments } from "./useWorkAttachments";

/** Work board attachment checks (CORE-192): the same rule as the API, before any request. */
function file(name: string, type: string, size = 10): File {
  const f = new File(["x"], name, { type });
  Object.defineProperty(f, "size", { value: size });
  return f;
}

beforeAll(() => {
  URL.createObjectURL = vi.fn(() => "blob:preview");
  URL.revokeObjectURL = vi.fn();
});

describe("attachmentRejection", () => {
  it("accepts images and PDFs up to 10 MB", () => {
    expect(attachmentRejection(file("a.png", "image/png"))).toBeNull();
    expect(attachmentRejection(file("a.heic", "image/heic"))).toBeNull();
    expect(attachmentRejection(file("a.pdf", "application/pdf", WORK_ATTACHMENT_MAX_BYTES))).toBeNull();
  });

  it("rejects other types and files over 10 MB or empty", () => {
    expect(attachmentRejection(file("a.zip", "application/zip"))).toBe("type");
    expect(attachmentRejection(file("a", ""))).toBe("type");
    expect(attachmentRejection(file("a.png", "image/png", WORK_ATTACHMENT_MAX_BYTES + 1))).toBe("size");
    expect(attachmentRejection(file("a.png", "image/png", 0))).toBe("size");
  });
});

describe("filesFromTransfer", () => {
  it("names a pasted screenshot and keeps a real file name", () => {
    const pasted = filesFromTransfer({ files: [file("image.png", "image/png")], items: [] } as unknown as DataTransfer);
    expect(pasted[0]!.name).toMatch(/^screenshot-\d{14}\.png$/);
    const named = filesFromTransfer({ files: [file("bug.jpg", "image/jpeg")], items: [] } as unknown as DataTransfer);
    expect(named[0]!.name).toBe("bug.jpg");
  });

  it("falls back to clipboard items when files is empty, and ignores text", () => {
    const shot = file("", "image/png");
    const data = {
      files: [],
      items: [
        { kind: "string", getAsFile: () => null },
        { kind: "file", getAsFile: () => shot },
      ],
    } as unknown as DataTransfer;
    expect(filesFromTransfer(data)).toHaveLength(1);
    expect(filesFromTransfer(null)).toEqual([]);
  });
});

describe("usePendingAttachments", () => {
  function withQueue() {
    let queue!: ReturnType<typeof usePendingAttachments>;
    const wrapper = mount(defineComponent({ setup: () => ((queue = usePendingAttachments()), () => h("div")) }));
    return { queue, wrapper };
  }

  it("queues good files, says why a bad one was left out and frees previews", () => {
    const { queue, wrapper } = withQueue();
    const added = queue.add([file("a.png", "image/png"), file("b.exe", "application/octet-stream"), file("c.pdf", "application/pdf")]);
    expect(added.map((p) => p.file.name)).toEqual(["a.png", "c.pdf"]);
    expect(queue.rejected.value).toBe("type");
    expect(added[0]!.preview).toBe("blob:preview");
    expect(added[1]!.preview).toBeNull();

    queue.remove(added[0]!.id);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview");
    expect(queue.pending.value).toHaveLength(1);
    wrapper.unmount();
    expect(queue.pending.value).toHaveLength(0);
  });
});
