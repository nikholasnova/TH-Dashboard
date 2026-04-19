import type { Metadata, Viewport } from "next";
import { Newsreader, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components/AuthProvider";
import { DevicesProvider } from "@/contexts/DevicesContext";
import { ChatShell } from "@/components/ChatShell";
import { ChatPageContextProvider } from "@/lib/chatContext";
import { PostHogProviderWrapper } from "@/components/PostHogProvider";
import { GuestProvider } from "@/contexts/GuestContext";

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
        <GuestProvider>
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
        </GuestProvider>
      </body>
    </html>
  );
}
