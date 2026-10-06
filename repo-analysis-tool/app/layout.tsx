import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppSidebar } from "@/components/sidebar";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "RAT — Repository Analysis Tool",
  description: "Upload or clone git repositories and analyze them.",
};

// The sidebar reads the registry on every request, so nothing may be
// prerendered with a build-time snapshot of the repository list.
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      {/* The sidebar reads the registry on every request, so the whole tree
          is rendered dynamically. */}
      <body className="flex min-h-full flex-col lg:flex-row">
        <AppSidebar />
        <div className="flex min-w-0 flex-1 flex-col">{children}</div>
      </body>
    </html>
  );
}
