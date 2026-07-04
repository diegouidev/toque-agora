import type { Metadata, Viewport } from "next";
import { Montserrat } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "./lib/auth-context";
import ServiceWorkerRegister from "./components/ServiceWorkerRegister";
import { ToastProvider } from "./components/Toast";
import { DialogProvider } from "./components/Dialog";
import { DownloadsProvider } from "./lib/downloads";

const display = Montserrat({
  subsets: ["latin"],
  weight: ["600", "700", "800", "900"],
  variable: "--font-display",
});

export const metadata: Metadata = {
  title: "TOQUE AGORA — A sua Playlist preferida",
  description:
    "TOQUE AGORA: faça upload dos seus .rar/.zip e ouça suas bandas com streaming direto, sem ocupar espaço extra.",
  manifest: "/manifest.webmanifest",
  applicationName: "TOQUE AGORA",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "TOQUE AGORA",
  },
  icons: {
    icon: [
      { url: "/icons/favicon.ico", sizes: "any" },
      { url: "/icons/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/icons/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#0b0b0f",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className={display.variable}>
      <body>
        <ServiceWorkerRegister />
        <ToastProvider>
          <DialogProvider>
            <AuthProvider>
              <DownloadsProvider>{children}</DownloadsProvider>
            </AuthProvider>
          </DialogProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
