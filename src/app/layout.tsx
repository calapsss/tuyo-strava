import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Route Forge GPX",
  description: "Draw a route, simulate realistic fitness telemetry, and export GPX.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
