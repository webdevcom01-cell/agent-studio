import type { Metadata } from "next";
import "../globals.css";

export const metadata: Metadata = {
  title: "Agent Studio",
  description: "Chat with AI agent",
};

export default function EmbedLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        {children}
      </body>
    </html>
  );
}
