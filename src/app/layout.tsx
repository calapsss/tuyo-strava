import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TUYO",
  description: "Compliance Tumakbo? TUYO!",
  applicationName: "TUYO",
  icons: {
    icon: [{ url: "/icon.png", type: "image/png" }],
    shortcut: [{ url: "/icon.png", type: "image/png" }],
    apple: [{ url: "/icon.png", type: "image/png" }],
  },
  openGraph: {
    title: "TUYO",
    description: "Compliance Tumakbo? TUYO!",
    siteName: "TUYO",
  },
  twitter: {
    card: "summary",
    title: "TUYO",
    description: "Compliance Tumakbo? TUYO!",
  },
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
