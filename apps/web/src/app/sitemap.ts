import type { MetadataRoute } from "next";
import { listDocSlugs } from "@/lib/docs";
import { SITE } from "@/lib/site";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const docs = await listDocSlugs();
  const now = new Date();

  return [
    { url: SITE.url, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE.url}/pricing`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE.url}/playground`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE.url}/enterprise`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE.url}/trust`, lastModified: now, changeFrequency: "monthly", priority: 0.4 },
    ...docs.map((slug) => ({
      url: slug ? `${SITE.url}/docs/${slug}` : `${SITE.url}/docs`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: slug ? 0.6 : 0.9,
    })),
    { url: `${SITE.url}/legal/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
    {
      url: `${SITE.url}/legal/privacy`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.2,
    },
  ];
}
