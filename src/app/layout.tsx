import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  applicationName: "Many Hands",
  title: {
    default: "Many Hands — five players, one body",
    template: "%s · Many Hands",
  },
  description: "A chaotic co-op physics party game: five players share one ragdoll body and race through timed challenges.",
  icons: { icon: "/icon.svg" },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Many Hands",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "dark",
  themeColor: "#080b10",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-[#080b10] text-[#f4f0e8] antialiased">{children}</body>
    </html>
  );
}
