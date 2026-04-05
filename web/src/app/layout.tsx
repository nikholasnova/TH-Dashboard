import type { Metadata, Viewport } from "next";
import { JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components/AuthProvider";
import { DevicesProvider } from "@/contexts/DevicesContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { ChatShell } from "@/components/ChatShell";
import { ChatPageContextProvider } from "@/lib/chatContext";

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
};

export const metadata: Metadata = {
  title: "Temp & Humidity Dashboard",
  description: "Real-time IoT temperature and humidity monitoring",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');var d=t!=='light';if(d)document.documentElement.classList.add('dark')}catch(e){}})()`,
          }}
        />
      </head>
      <body
        className={`${jetbrainsMono.variable} antialiased`}
      >
        <ThemeProvider>
          <AuthProvider>
            <DevicesProvider>
              <ChatPageContextProvider>
                {children}
                <ChatShell />
              </ChatPageContextProvider>
            </DevicesProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
