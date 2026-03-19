import templateData from "@/data/agent-templates.json";
import eccTemplateData from "@/data/ecc-agent-templates.json";
import { TemplatesPageClient } from "./templates-client";

export default function TemplatesPage(): React.JSX.Element {
  const allTemplates = [...templateData.templates, ...eccTemplateData.templates];
  const allCategories = [
    ...new Set([...templateData.categories, ...eccTemplateData.categories]),
  ];

  return (
    <TemplatesPageClient
      templates={allTemplates}
      categories={allCategories}
    />
  );
}
