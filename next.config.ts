import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 실행에 필요한 것만 추려 내보낸다(2026-09-02). 예전에는 빌드 결과물을 통째로 담아
  // 운영 이미지가 963MB 였다 — 소스와 개발 의존성까지 들어 있었다.
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
  // 2026-11-03: www.샘링크.kr 로 들어오면 정식 주소로 넘긴다(경로·? 뒤 값 유지).
  // www 는 브라우저가 다른 사이트로 봐서 '내가 만든 링크'·계정 연결이 따로 저장되고, 발표 화면 QR 이 깨졌다.
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.xn--9y2br3k43n.kr" }],
        destination: "https://xn--9y2br3k43n.kr/:path*",
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          {
            key: "Content-Security-Policy",
            value: "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self' https://xn--vz0ba242ncqcba79xhwx.site",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
