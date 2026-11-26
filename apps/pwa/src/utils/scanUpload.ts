/**
 * PUTs a scan file to the signed storage URL the API issued (NEO-262). The
 * bytes go straight to storage, never through the API (its Cloud Run caps a
 * request at 32 MiB). XMLHttpRequest, not fetch: only XHR reports upload
 * progress. The body is the form Supabase's own uploadToSignedUrl sends.
 */
export function putScanFile(uploadUrl: string, file: Blob, onProgress: (fraction: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`scan upload failed: ${xhr.status}`)));
    xhr.onerror = () => reject(new Error("scan upload failed: network"));
    xhr.onabort = () => reject(new Error("scan upload aborted"));
    const body = new FormData();
    body.append("cacheControl", "3600");
    body.append("", file);
    xhr.send(body);
  });
}
