import type { Metadata } from "next";
import Script from "next/script";
import { SessionProvider } from "next-auth/react";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "Agent Studio",
  description: "Local AI agent builder with knowledge base and RAG",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen antialiased">
        <SessionProvider>
          {children}
        </SessionProvider>
        <Toaster richColors position="bottom-right" />
        <Script
          src="/embed.js"
          data-agent-id="cmmfxpb97000cpbgy3w15p8ue"
          strategy="afterInteractive"
        />
      </body>
    </html>
  );
}
