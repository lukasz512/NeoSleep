import type AppIcon from "../components/AppIcon.vue";

type AppIconName = InstanceType<typeof AppIcon>["$props"]["name"];

/**
 * Own documents pinned above the partner library on Resources (NEO-242).
 * Files live in apps/pwa/public/resources/ and open in the browser's PDF
 * viewer, in this order.
 */
export interface FeaturedResource {
  id: string;
  titleKey: string;
  subtitleKey: string;
  icon: AppIconName;
  /** Path under the app's public folder, without the base URL. */
  file: string;
}

export const FEATURED_RESOURCES: readonly FeaturedResource[] = [
  {
    id: "protocolo-atencion",
    titleKey: "user.resources.featured.protocol.title",
    subtitleKey: "user.resources.featured.protocol.subtitle",
    icon: "file-pdf",
    file: "resources/protocolo-atencion-neosleep.pdf",
  },
];

export function featuredResourceHref(resource: FeaturedResource, base: string = import.meta.env.BASE_URL): string {
  return `${base.endsWith("/") ? base : `${base}/`}${resource.file}`;
}
