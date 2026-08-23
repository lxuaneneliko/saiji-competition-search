import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "賽跡 SAIJI｜GitHub 競賽作品搜尋",
  description: "從 GitHub Repository、README 與 Topics 找回散落的歷屆競賽作品，附上命中證據與可信度。",
  metadataBase: new URL("https://saiji-search.vercel.app"),
  applicationName: "賽跡 SAIJI",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icons/saiji-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/saiji-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/saiji-apple-180.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    title: "賽跡",
    statusBarStyle: "black-translucent",
  },
  formatDetection: { telephone: false },
  openGraph: {
    title: "賽跡 SAIJI｜競賽作品情報搜尋",
    description: "輸入任何競賽名稱，搜尋 GitHub 上可能的歷屆作品與原始證據。",
    type: "website",
    locale: "zh_TW",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#07110f",
  colorScheme: "dark",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-Hant" data-scroll-behavior="smooth">
      <body>{children}</body>
    </html>
  );
}
