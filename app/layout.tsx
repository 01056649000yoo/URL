import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://xn--9y2br3k43n.kr"),
  title: "\uc218\uc5c5\ub9c1\ud06c\ub97c \uc9e7\uac8c QR\ub85c",
  description:
    "\uc120\uc0dd\ub2d8\ub4e4\uc774 \uc790\uc8fc \uc4f0\ub294 \uc8fc\uc18c\ub97c \uc9e7\uc740 \ub9c1\ud06c\uc640 QR\ucf54\ub4dc\ub85c \uac04\ud3b8\ud558\uac8c \ub9cc\ub4e4 \uc218 \uc788\uc2b5\ub2c8\ub2e4.",
  alternates: {
    canonical: "/",
  },
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
