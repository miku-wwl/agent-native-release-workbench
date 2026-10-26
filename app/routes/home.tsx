import { ReleaseWorkbenchPage } from "@/components/home/ReleaseWorkbenchPage";
import { APP_TITLE } from "@/lib/app-config";

const SEO_TITLE = `${APP_TITLE} - Release decisions with evidence and approval`;
const SEO_DESCRIPTION =
  "Analyze synthetic CI evidence, review a bound plan, approve a local verification, and inspect the audit timeline.";

export function meta() {
  return [
    { title: SEO_TITLE },
    {
      name: "description",
      content: SEO_DESCRIPTION,
    },
    { property: "og:title", content: SEO_TITLE },
    { property: "og:description", content: SEO_DESCRIPTION },
    { name: "twitter:card", content: "summary" },
    { name: "twitter:title", content: SEO_TITLE },
    { name: "twitter:description", content: SEO_DESCRIPTION },
  ];
}

export default function HomeRoute() {
  return <ReleaseWorkbenchPage />;
}
