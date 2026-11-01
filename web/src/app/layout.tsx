import type { Metadata, Viewport } from "next";
import { ServiceWorkerRegister } from "@/components/sw-register";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "ORC Rendimiento", template: "%s · ORC" },
  description: "Datos de rendimiento del club: evaluaciones, bienestar y lesiones por categoría.",
  applicationName: "ORC Rendimiento",
  appleWebApp: { capable: true, title: "ORC", statusBarStyle: "black" },
  icons: {
    icon: [
      { url: "/crest.png", type: "image/png" },
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#231F20",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-AR">
      <body className="min-h-dvh font-sans antialiased">
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
