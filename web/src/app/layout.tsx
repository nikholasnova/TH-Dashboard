import type { Metadata, Viewport } from "next";
import { Newsreader, Geist_Mono } from "next/font/google";
import { connection } from "next/server";
import "./globals.css";
import { AuthProvider } from "@/components/AuthProvider";
import { DevicesProvider } from "@/contexts/DevicesContext";
import { ChatShell } from "@/components/ChatShell";
import { ChatPageContextProvider } from "@/lib/chatContext";
import { PostHogProviderWrapper } from "@/components/PostHogProvider";

const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  axes: ["opsz"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Opt the entire route tree into dynamic rendering so the per-request
  // CSP nonce set by middleware reaches every inline script. Without this,
  // Next.js prerenders the HTML shell once and the baked __next_f.push
  // scripts never receive the nonce.
  await connection();

  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${newsreader.variable} ${geistMono.variable} antialiased`}
      >
        <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:p-4 focus:bg-[var(--glass-bg)] focus:text-[var(--foreground)]">
          Skip to main content
        </a>
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
      </body>
    </html>
  );
}
