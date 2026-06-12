import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { Sidebar } from "@/components/sidebar";
import { FloatingLoop } from "@/components/floating-loop";

export const metadata: Metadata = {
  title: "Loop — AI Marketing Co-Pilot",
  description:
    "Loop finds the opportunity, proposes a full campaign with its reasoning shown, fires it through a realistic delivery pipeline, and attributes the revenue.",
};

// viewport-fit=cover so env(safe-area-inset-*) works (notch / home indicator on phones)
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable} h-full`}
      suppressHydrationWarning
    >
      <body className="min-h-full">
        <div className="flex h-screen overflow-hidden">
          <Sidebar />
          {/* mobile: clear the fixed top bar (pt-14) + the floating button (pb-20); desktop unchanged */}
          <main className="flex-1 overflow-y-auto pt-14 pb-20 md:pt-0 md:pb-0">{children}</main>
        </div>
        <FloatingLoop />
      </body>
    </html>
  );
}
