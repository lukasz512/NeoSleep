// Copies every object from every Supabase Storage bucket into a local directory,
// preserving bucket/path structure. Used by .github/workflows/nightly-backup.yml
// (NEO-62), which tars, encrypts and uploads the result.
//
// Usage: SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node storage-export.mjs <out-dir>
//
// Fails (non-zero exit) on any list or download error: a partial file backup
// must never look like a successful one.

import { createClient } from "@supabase/supabase-js";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const PAGE_SIZE = 1000;

const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;
const outDir = process.argv[2];

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !outDir) {
  console.error("Usage: SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node storage-export.mjs <out-dir>");
  process.exit(2);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });

/** Lists every file path under `prefix`, recursing into folders (entries with id === null). */
async function listFiles(bucket, prefix) {
  const files = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit: PAGE_SIZE, offset });
    if (error) throw new Error(`list ${bucket}/${prefix} failed: ${error.message}`);
    for (const entry of data) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.id === null) files.push(...(await listFiles(bucket, path)));
      else files.push(path);
    }
    if (data.length < PAGE_SIZE) return files;
  }
}

const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();
if (bucketsError) throw new Error(`listBuckets failed: ${bucketsError.message}`);

let total = 0;
for (const bucket of buckets) {
  const paths = await listFiles(bucket.name, "");
  for (const path of paths) {
    const { data, error } = await supabase.storage.from(bucket.name).download(path);
    if (error) throw new Error(`download ${bucket.name}/${path} failed: ${error.message}`);
    const target = join(outDir, bucket.name, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, Buffer.from(await data.arrayBuffer()));
  }
  console.log(`${bucket.name}: ${paths.length} objects`);
  total += paths.length;
}
console.log(`Storage export complete: ${buckets.length} buckets, ${total} objects`);
