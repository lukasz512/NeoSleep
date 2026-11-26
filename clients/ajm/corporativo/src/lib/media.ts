/** Media lives on Cloudflare R2 in production (R5); locally in public/media (scripts/encode-media.sh). */
const BASE = (import.meta.env.VITE_MEDIA_BASE as string | undefined)?.replace(/\/+$/, "") ?? "/media";

export function mediaUrl(path: string): string {
  return `${BASE}/${path.replace(/^\/+/, "")}`;
}

/** Silent loop in the weight the device can carry: 360p in lite mode, 720p otherwise. */
export function loopUrl(base: string, lite: boolean): string {
  return mediaUrl(`${base}-${lite ? "360" : "720"}.mp4`);
}

export interface PictureSources {
  avif: string;
  jpg: string;
}

export function picture(base: string): PictureSources {
  return { avif: mediaUrl(`${base}.avif`), jpg: mediaUrl(`${base}.jpg`) };
}
