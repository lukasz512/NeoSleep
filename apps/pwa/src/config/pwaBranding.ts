/**
 * Installed-app name and icons per release channel (CORE-178). A dev install
 * must not look like prod on the home screen: it gets the orange DEV icons
 * (scripts/generate-pwa-icons.mjs) and its full name carries the version.
 * The label under the icon stays short and version-free — it fits ~12
 * characters, and iOS copies it once at "Add to Home Screen", so a version
 * there would go stale; the always-current version sits in the app bar badge.
 */
export interface PwaBrandingInput {
  /** VITE_APP_CHANNEL as CI sets it; anything but "dev" brands as prod. */
  channel: string | undefined;
  version: string;
  /** VITE_APP_BUILD as CI sets it; absent outside CI. */
  build: number | string | undefined;
}

export interface PwaBranding {
  name: string;
  shortName: string;
  icon192: string;
  icon512: string;
  iconMaskable512: string;
  appleTouchIcon: string;
}

const APP_NAME = "NeoSleep";

export function pwaBranding({ channel, version, build }: PwaBrandingInput): PwaBranding {
  if (channel !== "dev") {
    return {
      name: APP_NAME,
      shortName: APP_NAME,
      icon192: "/icon-192.png",
      icon512: "/icon-512.png",
      iconMaskable512: "/icon-maskable-512.png",
      appleTouchIcon: "/apple-touch-icon.png",
    };
  }
  const fullVersion = build === undefined || build === "" ? version : `${version}.${build}`;
  return {
    name: `${APP_NAME} DEV ${fullVersion}`,
    shortName: `${APP_NAME} DEV`,
    icon192: "/icon-dev-192.png",
    icon512: "/icon-dev-512.png",
    iconMaskable512: "/icon-dev-maskable-512.png",
    appleTouchIcon: "/apple-touch-icon-dev.png",
  };
}
