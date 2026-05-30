import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://xn--9y2br3k43n.kr"),
  title: "샘링크 - 수업링크를 짧고 간편하게, QR코드로 바로 접속",
  description:
    "선생님들이 자주 쓰는 주소를 짧은 링크와 QR코드로 간편하게 만들 수 있습니다.",
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
