import type { Metadata } from "next";
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
          <main className="flex-1 overflow-y-auto">{children}</main>
        </div>
        <FloatingLoop />
      </body>
    </html>
  );
}
