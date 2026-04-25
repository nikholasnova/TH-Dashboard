import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Newsreader, Geist_Mono } from "next/font/google";
import { connection } from "next/server";
import "./globals.css";
import { AuthProvider } from "@/components/AuthProvider";
import { DevicesProvider } from "@/contexts/DevicesContext";
import { ChatShell } from "@/components/ChatShell";
import { ChatPageContextProvider } from "@/lib/chatContext";
import { PostHogProviderWrapper } from "@/components/PostHogProvider";

// Server component that defers rendering to request time so the CSP nonce
// set by middleware lands on Next.js's inline scripts. Wrapping in <Suspense>
// (in RootLayout below) lets the static shell stream while only this gate
// waits for the request — much snappier client-side navigation than
// `await connection()` directly inside the layout.
async function DynamicNonceGate({ children }: { children: React.ReactNode }) {
  await connection();
  return <>{children}</>;
}

// preload: false avoids "preloaded but not used" warnings on cold loads where
// the framer-motion intro animation pushes first text paint past Chrome's
// preload-use deadline. Fonts still load via the CSS variable, just without
// a <link rel="preload">.
const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  axes: ["opsz"],
  preload: false,
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  preload: false,
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
};

export const metadata: Metadata = {
  title: "Temp & Humidity Dashboard",
  description: "Real-time IoT temperature and humidity monitoring",
  openGraph: {
    title: "Temp & Humidity Dashboard",
    description: "Real-time IoT temperature and humidity monitoring",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${newsreader.variable} ${geistMono.variable} antialiased`}
      >
        <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:p-4 focus:bg-[var(--glass-bg)] focus:text-[var(--foreground)]">
          Skip to main content
        </a>
        <Suspense fallback={null}>
          <DynamicNonceGate>
            <AuthProvider>
              <PostHogProviderWrapper>
                <DevicesProvider>
                  <ChatPageContextProvider>
                    {children}
                    <ChatShell />
                  </ChatPageContextProvider>
                </DevicesProvider>
              </PostHogProviderWrapper>
            </AuthProvider>
          </DynamicNonceGate>
        </Suspense>
      </body>
    </html>
  );
}
