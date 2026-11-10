// Storage side of the anonymized dev copy (CORE-189). Every file in the backup
// (signed agreements, sleep study reports, photos) is replaced with a placeholder of
// the same type, so file_attachment rows still open something in pwa-dev.
//
// Usage:
//   node dev-storage.mjs scrub-dir <dir>   replace every file under <dir> (an extracted
//                                          storage backup: <dir>/<bucket>/<path>) in place
//   node dev-storage.mjs upload <dir>      upload <dir>/<bucket>/<path> to the dev project,
//                                          creating missing buckets (private)
//   node dev-storage.mjs scrub-live        overwrite every object already in the dev project
//
// upload/scrub-live import @supabase/supabase-js, which lives in apps/api: run them via
// refresh.sh, or with the script next to a node_modules that has it (like the nightly backup).
// upload and scrub-live need SUPABASE_URL, SUPABASE_SERVICE_KEY and DEV_SUPABASE_REF, and
// refuse to run unless SUPABASE_URL is exactly that dev project (never production).

import { readdir, readFile, writeFile } from "node:fs/promises";
import { extname, join, relative, sep } from "node:path";

const PAGE_SIZE = 1000;
const PLACEHOLDER_TEXT = "Anonymized document (dev copy)";

/** Smallest valid one-page PDF showing PLACEHOLDER_TEXT; pdf.js opens it without warnings. */
export function placeholderPdf() {
  const stream = `BT /F1 18 Tf 72 720 Td (${PLACEHOLDER_TEXT}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let body = "%PDF-1.4\n";
  const offsets = objects.map((obj, i) => {
    const offset = body.length;
    body += `${i + 1} 0 obj\n${obj}\nendobj\n`;
    return offset;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, "latin1");
}

// 1x1 grey PNG
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGNoAAAAggCBd81ytgAAAABJRU5ErkJggg==",
  "base64",
);

const CONTENT_TYPES = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/png",
  ".jpeg": "image/png",
  ".webp": "image/png",
  ".gif": "image/png",
  ".heic": "image/png",
};

/** Placeholder bytes + content type for a file name. Images become a PNG (browsers sniff it). */
export function placeholderFor(name) {
  const ext = extname(name).toLowerCase();
  if (ext === ".pdf") return { body: placeholderPdf(), contentType: CONTENT_TYPES[ext] };
  if (CONTENT_TYPES[ext]) return { body: PNG, contentType: CONTENT_TYPES[ext] };
  return { body: Buffer.from(`${PLACEHOLDER_TEXT}\n`), contentType: "text/plain" };
}

/** Throws unless url is https://<devRef>.supabase.co. */
export function assertDevProject(url, devRef) {
  if (!devRef) throw new Error("DEV_SUPABASE_REF is not set");
  if (url !== `https://${devRef}.supabase.co`) {
    throw new Error(`SUPABASE_URL ${url} is not the dev project ${devRef}; refusing to touch it`);
  }
}

async function walk(dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(path)));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

async function scrubDir(dir) {
  const files = await walk(dir);
  for (const file of files) await writeFile(file, placeholderFor(file).body);
  console.log(`scrub-dir: replaced ${files.length} files under ${dir}`);
}

async function devClient() {
  const { createClient } = await import("@supabase/supabase-js");
  const { SUPABASE_URL, SUPABASE_SERVICE_KEY, DEV_SUPABASE_REF } = process.env;
  assertDevProject(SUPABASE_URL, DEV_SUPABASE_REF);
  if (!SUPABASE_SERVICE_KEY) throw new Error("SUPABASE_SERVICE_KEY is not set");
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
}

async function put(supabase, bucket, path, body, contentType) {
  const { error } = await supabase.storage.from(bucket).upload(path, body, { contentType, upsert: true });
  if (error) throw new Error(`upload ${bucket}/${path} failed: ${error.message}`);
}

async function upload(dir) {
  const supabase = await devClient();
  const { data: existing, error } = await supabase.storage.listBuckets();
  if (error) throw new Error(`listBuckets failed: ${error.message}`);
  const buckets = new Set(existing.map((b) => b.name));
  const files = await walk(dir);
  for (const file of files) {
    const [bucket, ...rest] = relative(dir, file).split(sep);
    if (!buckets.has(bucket)) {
      const { error: createError } = await supabase.storage.createBucket(bucket, { public: false });
      if (createError) throw new Error(`createBucket ${bucket} failed: ${createError.message}`);
      buckets.add(bucket);
    }
    // Content type from the placeholder rule, so a .jpg path that now holds PNG bytes says so.
    await put(supabase, bucket, rest.join("/"), await readFile(file), placeholderFor(file).contentType);
  }
  console.log(`upload: ${files.length} files`);
}

async function listFiles(supabase, bucket, prefix) {
  const files = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit: PAGE_SIZE, offset });
    if (error) throw new Error(`list ${bucket}/${prefix} failed: ${error.message}`);
    for (const entry of data) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.id === null) files.push(...(await listFiles(supabase, bucket, path)));
      else files.push(path);
    }
    if (data.length < PAGE_SIZE) return files;
  }
}

async function scrubLive() {
  const supabase = await devClient();
  const { data: buckets, error } = await supabase.storage.listBuckets();
  if (error) throw new Error(`listBuckets failed: ${error.message}`);
  let total = 0;
  for (const bucket of buckets) {
    const paths = await listFiles(supabase, bucket.name, "");
    for (const path of paths) {
      const { body, contentType } = placeholderFor(path);
      await put(supabase, bucket.name, path, body, contentType);
    }
    console.log(`${bucket.name}: ${paths.length} objects replaced`);
    total += paths.length;
  }
  console.log(`scrub-live: ${total} objects replaced`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [command, dir] = process.argv.slice(2);
  const commands = { "scrub-dir": () => scrubDir(dir), upload: () => upload(dir), "scrub-live": scrubLive };
  if (!commands[command] || (command !== "scrub-live" && !dir)) {
    console.error("Usage: node dev-storage.mjs scrub-dir <dir> | upload <dir> | scrub-live");
    process.exit(2);
  }
  await commands[command]();
}
