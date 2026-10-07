import { deflateSync, inflateSync } from "node:zlib";

/**
 * NEO-255 D2: consents signed before NEO-252 kept the patient's drawn signature only inside
 * the signed PDF. Chromium embeds that PNG as an RGB image XObject plus a gray /SMask (its
 * transparency), both FlateDecode at the original size, so it can be rebuilt as a PNG at
 * print time — nothing is written back.
 */

interface PdfImage {
  id: number;
  dict: string;
  data: Uint8Array;
}

const OBJECT_RE = /(\d+) 0 obj\s*<<([\s\S]*?)>>\s*stream\r?\n/g;

function imageObjects(pdf: Uint8Array): Map<number, PdfImage> {
  const text = Buffer.from(pdf).toString("latin1");
  const images = new Map<number, PdfImage>();
  for (const m of text.matchAll(OBJECT_RE)) {
    const dict = m[2];
    if (!/\/Subtype\s*\/Image\b/.test(dict)) continue;
    const start = m.index + m[0].length;
    const length = /\/Length\s+(\d+)(?!\s+\d+\s+R)/.exec(dict);
    const end = length ? start + Number(length[1]) : text.indexOf("endstream", start);
    if (end < start) continue;
    images.set(Number(m[1]), { id: Number(m[1]), dict, data: pdf.subarray(start, end) });
  }
  return images;
}

function intEntry(dict: string, key: string): number | null {
  const m = new RegExp(`/${key}\\s+(\\d+)`).exec(dict);
  return m ? Number(m[1]) : null;
}

function inflated(image: PdfImage, components: number, width: number, height: number): Buffer | null {
  if (!/\/Filter\s*\/FlateDecode\b/.test(image.dict) || /\/DecodeParms/.test(image.dict)) return null;
  if (intEntry(image.dict, "BitsPerComponent") !== 8) return null;
  try {
    const raw = inflateSync(image.data);
    return raw.length === width * height * components ? raw : null;
  } catch {
    return null;
  }
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes: Buffer): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** An 8-bit RGBA PNG (filter 0 on every row). */
export function encodePng(width: number, height: number, rgba: Buffer): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 6, 0, 0, 0], 8);
  const rows = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) rgba.copy(rows, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(rows)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/**
 * The patient's drawn signature from a signed consent PDF, as a PNG data URL: the last
 * transparent image (a drawn signature is the only one with an /SMask, and it closes the
 * document). Null when there is none or it isn't in the shape Chromium writes.
 */
export function signaturePngFromPdf(pdf: Uint8Array): string | null {
  const images = imageObjects(pdf);
  const withMask = [...images.values()].filter((i) => /\/SMask\s+\d+\s+0\s+R/.test(i.dict));
  const image = withMask.at(-1);
  if (!image) return null;
  const width = intEntry(image.dict, "Width");
  const height = intEntry(image.dict, "Height");
  const mask = images.get(Number(/\/SMask\s+(\d+)\s+0\s+R/.exec(image.dict)![1]));
  if (!width || !height || !mask) return null;
  if (intEntry(mask.dict, "Width") !== width || intEntry(mask.dict, "Height") !== height) return null;
  const components = /\/ColorSpace\s*\/DeviceGray\b/.test(image.dict) ? 1 : 3;
  const color = inflated(image, components, width, height);
  const alpha = inflated(mask, 1, width, height);
  if (!color || !alpha) return null;
  const rgba = Buffer.alloc(width * height * 4);
  for (let p = 0; p < width * height; p++) {
    const c = p * components;
    rgba[p * 4] = color[c];
    rgba[p * 4 + 1] = color[components === 3 ? c + 1 : c];
    rgba[p * 4 + 2] = color[components === 3 ? c + 2 : c];
    rgba[p * 4 + 3] = alpha[p];
  }
  return `data:image/png;base64,${encodePng(width, height, rgba).toString("base64")}`;
}
