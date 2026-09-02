import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 실행에 필요한 것만 추려 내보낸다(2026-09-02). 예전에는 빌드 결과물을 통째로 담아
  // 운영 이미지가 963MB 였다 — 소스와 개발 의존성까지 들어 있었다.
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
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
