import type { Metadata } from "next";
import Script from "next/script";
import { DM_Sans } from "next/font/google";
import { SessionProvider } from "next-auth/react";
import { Toaster } from "sonner";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Agent Studio",
  description: "Build and manage your AI agents",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${dmSans.variable} font-[family-name:var(--font-sans)] min-h-screen antialiased`}>
        <SessionProvider>
          <ThemeProvider>
            {children}
          </ThemeProvider>
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
