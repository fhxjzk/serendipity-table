import type { Metadata, Viewport } from "next";
import { Nanum_Myeongjo } from "next/font/google";
import "./globals.css";

// 본문은 Pretendard(globals.css), 명조는 브랜드 제목에만 쓴다.
const display = Nanum_Myeongjo({ variable: "--font-display", weight: ["700", "800"], subsets: ["latin"], preload: false });

export const metadata: Metadata = {
  // Absolute base for the link-preview image (opengraph-image.png) when the address is shared.
  metadataBase: new URL(process.env.SITE_URL?.startsWith("https://") ? process.env.SITE_URL : "https://serendipity-table-zeta.vercel.app"),
  title: "우연한 식탁",
  openGraph: { title: "우연한 식탁", description: "매주 목요일 저녁, 처음 보는 사람들과 좋은 저녁 한 끼", locale: "ko_KR", type: "website" },
  description: "매주 목요일 저녁, 처음 보는 사람들과 좋은 저녁 한 끼",
  // Home-screen install (F-40): iPhone needs the app installed before it can receive web push.
  appleWebApp: { capable: true, title: "우연한 식탁", statusBarStyle: "default" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = { themeColor: "#18120e" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className={`${display.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
