"use client";

import dynamic from "next/dynamic";

const DynamicToaster = dynamic(
  () => import("sonner").then((mod) => ({ default: mod.Toaster })),
  { ssr: false }
);

export function ToasterProvider() {
  return <DynamicToaster richColors position="bottom-right" />;
}
