import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "샘링크",
  description: "샘링크.kr에서 쓰는 4자리 코드 기반 URL 단축기",
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
