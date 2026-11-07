import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PeakSure | Battery decision intelligence",
  description: "Cell-level battery intelligence for coincident-peak commitment on REON's CES. Simulated; independent analysis, not endorsed by REON.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#f4f6f5" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="h-full">{children}</body>
    </html>
  );
}
