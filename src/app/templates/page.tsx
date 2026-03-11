import templateData from "@/data/agent-templates.json";
import { TemplatesPageClient } from "./templates-client";

export default function TemplatesPage(): React.JSX.Element {
  return (
    <TemplatesPageClient
      templates={templateData.templates}
      categories={templateData.categories}
    />
  );
}
