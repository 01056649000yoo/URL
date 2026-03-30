import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Private Short Links",
  description: "A lightweight URL shortener for a small trusted group.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
