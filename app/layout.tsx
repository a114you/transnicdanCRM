import type { Metadata } from "next";
import { Oswald, Bebas_Neue, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/layout/Header";
import { ThemeScript } from "@/components/layout/ThemeScript";
import { LanguageProvider } from "@/components/layout/LanguageProvider";
import { AppAlertProvider } from "@/components/layout/AppAlertProvider";
import { PWARegister } from "@/components/layout/PWARegister";
import { cookies } from "next/headers";
import type { Language } from "@/lib/i18n";
import { getCurrentUser } from "@/lib/auth";

// Fonts - Industrial Garage Aesthetic
const oswald = Oswald({
  subsets: ["latin", "cyrillic"],
  weight: ["600", "700"],
  variable: "--font-oswald",
  display: "swap",
});

const bebasNeue = Bebas_Neue({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-bebas",
  display: "swap",
});

const ibmPlexSans = IBM_Plex_Sans({
  subsets: ["latin", "cyrillic"],
  weight: ["400", "600"],
  variable: "--font-ibm",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
  applicationName: "SPARK CRM",
  title: {
    default: "SPARK CRM",
    template: "%s | SPARK CRM",
  },
  description: "CRM система для автосервиса — SPARK",
  robots: {
    index: false,
    follow: false,
  },
  icons: {
    icon: [
      { url: "/spark.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/spark.svg", type: "image/svg+xml" },
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "SPARK CRM",
    statusBarStyle: "black-translucent",
    startupImage: [],
  },
  formatDetection: {
    telephone: false,
  },
  other: {
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-title": "SPARK CRM",
    "apple-mobile-web-app-status-bar-style": "black-translucent",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ff6b00",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const cookieLanguage = cookieStore.get("crm-language")?.value;
  const language: Language = cookieLanguage === "ro" || cookieLanguage === "en" ? cookieLanguage : "ru";
  const user = await getCurrentUser();

  return (
    <html lang={language} suppressHydrationWarning className={`${oswald.variable} ${bebasNeue.variable} ${ibmPlexSans.variable}`}>
      <body className={`min-h-screen flex flex-col bg-background text-foreground antialiased ${ibmPlexSans.className}`}>
        {/* next/script beforeInteractive — safe theme FOUC fix (no raw <script> in body) */}
        <ThemeScript />
        <a href="#main-content" className="skip-to-content">
          {language === "ro" ? "Sari la conținut" : "К основному содержимому"}
        </a>
        <PWARegister />
        <LanguageProvider initialLanguage={language}>
        <AppAlertProvider>
        {user && <Header userId={user.userId} />}

        {/* MAIN CONTENT — mobile bottom inset matches fixed tab bar (~64px + safe area) */}
        <main
          id="main-content"
          tabIndex={-1}
          className={
            user
              ? "mx-auto w-full max-w-[1600px] flex-1 min-h-[70vh] px-3 sm:px-4 lg:px-6 xl:px-8 pt-4 sm:pt-6 lg:pt-7 xl:pt-8 pb-[calc(4.75rem+env(safe-area-inset-bottom))] lg:pb-10"
              : "px-4 flex-1 min-h-[70vh]"
          }
        >
          {children}
        </main>

        {/* FOOTER — desktop only; mobile uses bottom nav */}
        {user && (
          <footer className="hidden lg:block border-t border-border/70 bg-muted/40 mt-auto">
            <div className="mx-auto w-full max-w-[1600px] px-6 xl:px-8 py-5">
              <div className="flex flex-row items-center justify-between gap-6">
                <div className="flex items-center gap-6 min-w-0">
                  <span
                    className="font-display text-lg tracking-wide text-muted-foreground shrink-0"
                    style={{ fontFamily: "var(--font-bebas)" }}
                  >
                    SPARK CRM
                  </span>
                  <nav className="hidden xl:flex items-center gap-1 text-xs text-muted-foreground">
                    <a href="/clients" className="px-2 py-1 rounded-md hover:text-foreground hover:bg-muted transition-colors">
                      {language === "ro" ? "Clienți" : "Клиенты"}
                    </a>
                    <a href="/orders" className="px-2 py-1 rounded-md hover:text-foreground hover:bg-muted transition-colors">
                      {language === "ro" ? "Reparații" : "Ремонты"}
                    </a>
                    <a href="/cautpiese" className="px-2 py-1 rounded-md hover:text-foreground hover:bg-muted transition-colors">
                      {language === "ro" ? "Piese" : "Запчасти"}
                    </a>
                    <a href="/reports" className="px-2 py-1 rounded-md hover:text-foreground hover:bg-muted transition-colors">
                      {language === "ro" ? "Rapoarte" : "Отчёты"}
                    </a>
                    <a href="/settings" className="px-2 py-1 rounded-md hover:text-foreground hover:bg-muted transition-colors">
                      {language === "ro" ? "Setări" : "Настройки"}
                    </a>
                  </nav>
                </div>
                <p className="text-xs sm:text-sm text-muted-foreground shrink-0">
                  © {new Date().getFullYear()}{" "}
                  {language === "ru"
                    ? "Все права защищены"
                    : language === "ro"
                      ? "Toate drepturile rezervate"
                      : "All rights reserved"}
                </p>
              </div>
            </div>
          </footer>
        )}
        </AppAlertProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
