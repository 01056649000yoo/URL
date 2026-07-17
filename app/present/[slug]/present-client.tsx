"use client";

import { useEffect, useMemo, useState } from "react";

const BRAND_DOMAIN = "샘링크.kr";

type LinkStatsResult = {
  recentVisitors?: number;
  todayVisitors?: number;
  clickCount?: number;
  error?: string;
};

export default function PresentClient({ slug }: { slug: string }) {
  const [origin, setOrigin] = useState("");
  const [recentVisitors, setRecentVisitors] = useState<number | null>(null);
  const [canSeeStats, setCanSeeStats] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    let mounted = true;

    async function loadStats() {
      try {
        const response = await fetch(`/api/link-stats/${encodeURIComponent(slug)}`);
        if (!mounted) return;

        if (!response.ok) {
          // 링크를 만든 브라우저가 아니면 통계 권한이 없으므로 카운터를 숨깁니다.
          if (response.status === 403 || response.status === 404) {
            setCanSeeStats(false);
          }
          return;
        }

        const data = (await response.json()) as LinkStatsResult;
        if (!mounted) return;
        setCanSeeStats(true);
        setRecentVisitors(data.recentVisitors ?? 0);
      } catch {
        // 일시적인 네트워크 오류는 조용히 무시하고 다음 주기에 다시 시도합니다.
      }
    }

    void loadStats();
    const timer = window.setInterval(() => {
      void loadStats();
    }, 5000);

    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, [slug]);

  useEffect(() => {
    function handleChange() {
      setIsFullscreen(Boolean(document.fullscreenElement));
    }
    document.addEventListener("fullscreenchange", handleChange);
    return () => document.removeEventListener("fullscreenchange", handleChange);
  }, []);

  const shortUrl = useMemo(() => {
    if (!origin) return "";
    return `${origin}/${encodeURIComponent(slug)}`;
  }, [origin, slug]);

  const displayUrl = useMemo(() => {
    if (!origin) return "";
    const host = new URL(origin).host;
    const displayHost = host.includes("xn--") ? BRAND_DOMAIN : host;
    return `${displayHost}/${slug}`;
  }, [origin, slug]);

  const qrSrc = shortUrl
    ? `/api/qr?size=1200&margin=10&data=${encodeURIComponent(shortUrl)}`
    : "";

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      // 전체화면이 막힌 환경에서는 버튼만 무시됩니다.
    }
  }

  return (
    <main className="present-shell">
      <button className="present-fullscreen" type="button" onClick={toggleFullscreen}>
        {isFullscreen ? "전체화면 나가기" : "⛶ 전체화면"}
      </button>

      <section className="present-stage">
        {qrSrc ? <img className="present-qr" src={qrSrc} alt={`${displayUrl} QR 코드`} /> : null}
        <p className="present-url">{displayUrl}</p>
        {canSeeStats ? (
          <p className="present-counter" aria-live="polite">
            <span className="present-counter-dot" aria-hidden="true" />
            최근 5분 접속 <strong>{recentVisitors ?? 0}</strong>명
          </p>
        ) : null}
        <p className="present-hint">휴대폰 카메라로 QR을 찍거나, 주소를 그대로 입력하세요</p>
      </section>
    </main>
  );
}
