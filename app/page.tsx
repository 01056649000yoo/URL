"use client";

import Image from "next/image";
import { FormEvent, useEffect, useMemo, useState } from "react";

type CreateResult = {
  shortUrl: string;
  displayShortUrl?: string;
  slug: string;
  destination: string;
  expiresAt?: string;
  retentionPeriod?: string;
};

type ErrorResult = {
  error?: string;
};

type StatsResult = {
  totalCount?: number;
  createdCount?: number;
  activeCount?: number;
  deletedCount?: number;
  commitHash?: string;
  error?: string;
};

type LinkStatsResult = {
  slug?: string;
  clickCount?: number;
  recentVisitors?: number;
  todayVisitors?: number;
  isActive?: boolean;
  expiresAt?: string | null;
  error?: string;
};

type MyLink = {
  slug: string;
  destination: string;
  shortUrl: string;
  displayShortUrl?: string;
  expiresAt?: string;
  isActive: boolean;
  createdAt: string;
};

type MyLinksResult = {
  links?: MyLink[];
  error?: string;
};

type RetentionPeriod = "day" | "week" | "month" | "quarter";

const LAST_RESULT_KEY = "samlink-last-result";
const MY_LINKS_KEY = "samlink-my-links";
const MAX_SAVED_LINKS = 30;

const BRAND_DOMAIN = "샘링크.kr";
const PAGE_TITLE = "샘링크 | 수업링크를 짧고 간편하게, QR코드로 바로 접속";

type SavedLink = CreateResult & {
  savedAt: string;
};

type SavedLinkStats = {
  clickCount: number;
  recentVisitors: number;
  todayVisitors: number;
  isActive?: boolean;
  expiresAt?: string | null;
};

function formatDateTime(value?: string) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function isExpired(value?: string | null) {
  if (!value) return false;
  const time = new Date(value).getTime();
  return Number.isFinite(time) && time <= Date.now();
}

function readSavedLinks() {
  try {
    const raw = window.localStorage.getItem(MY_LINKS_KEY);
    if (!raw) return [] as SavedLink[];
    const parsed = JSON.parse(raw) as SavedLink[];
    return parsed.filter((link) => link.slug && link.shortUrl && !isExpired(link.expiresAt));
  } catch {
    return [] as SavedLink[];
  }
}

function writeSavedLinks(links: SavedLink[]) {
  window.localStorage.setItem(MY_LINKS_KEY, JSON.stringify(links.slice(0, MAX_SAVED_LINKS)));
}

export default function HomePage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<CreateResult | null>(null);
  const [error, setError] = useState("");
  const [copyLabel, setCopyLabel] = useState("복사");
  const [isQrOpen, setIsQrOpen] = useState(false);
  const [isSavedQrOpen, setIsSavedQrOpen] = useState(false);
  const [qrScale, setQrScale] = useState<1 | 1.5>(1);
  const [savedLinks, setSavedLinks] = useState<SavedLink[]>([]);
  const [selectedSavedSlug, setSelectedSavedSlug] = useState<string | null>(null);
  const [linkStats, setLinkStats] = useState({
    clickCount: 0,
    recentVisitors: 0,
    todayVisitors: 0,
  });
  const [savedLinkStats, setSavedLinkStats] = useState<Record<string, SavedLinkStats>>({});
  const [myLinks, setMyLinks] = useState<MyLink[]>([]);
  const [isLoadingMyLinks, setIsLoadingMyLinks] = useState(false);
  const [isMyLinksExpanded, setIsMyLinksExpanded] = useState(false);
  const [stats, setStats] = useState({
    totalCount: 0,
    createdCount: 0,
    activeCount: 0,
    deletedCount: 0,
    commitHash: "",
  });

  const resultUrl = result?.displayShortUrl ?? result?.shortUrl ?? "";
  const selectedSavedLink = savedLinks.find((link) => link.slug === selectedSavedSlug) ?? null;
  const selectedSavedStats = selectedSavedLink ? savedLinkStats[selectedSavedLink.slug] : null;
  const selectedSavedUrl = selectedSavedLink
    ? selectedSavedLink.displayShortUrl ?? selectedSavedLink.shortUrl
    : "";
  const visibleMyLinks = isMyLinksExpanded ? myLinks : myLinks.slice(0, 3);
  const hiddenMyLinkCount = Math.max(myLinks.length - visibleMyLinks.length, 0);

  async function loadMyLinks() {
    setIsLoadingMyLinks(true);

    try {
      const response = await fetch("/api/my-links");
      const data = (await response.json()) as MyLinksResult;

      if (!response.ok) {
        return;
      }

      setMyLinks(data.links ?? []);
    } catch {
      // 내 링크 목록은 보조 정보라서 실패해도 링크 생성 흐름은 막지 않습니다.
    } finally {
      setIsLoadingMyLinks(false);
    }
  }

  useEffect(() => {
    document.title = PAGE_TITLE;
  }, []);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(LAST_RESULT_KEY);
      if (!saved) return;

      const parsed = JSON.parse(saved) as CreateResult;
      if (!parsed?.slug || !parsed?.shortUrl) return;
      setResult(parsed);
    } catch {
      // 저장된 최근 링크가 없어도 정상입니다.
    }

    const links = readSavedLinks();
    setSavedLinks(links);
    writeSavedLinks(links);
    void loadMyLinks();
  }, []);

  const qrImageUrl = useMemo(() => {
    if (!resultUrl) return "";
    return `/api/qr?size=360&margin=10&data=${encodeURIComponent(resultUrl)}`;
  }, [resultUrl]);

  const qrModalImageUrl = useMemo(() => {
    if (!resultUrl) return "";
    const size = qrScale === 1.5 ? 540 : 360;
    return `/api/qr?size=${size}&margin=10&data=${encodeURIComponent(resultUrl)}`;
  }, [qrScale, resultUrl]);

  const qrDownloadUrl = useMemo(() => {
    if (!resultUrl) return "";
    return `/api/qr?size=1200&margin=20&data=${encodeURIComponent(resultUrl)}`;
  }, [resultUrl]);

  const selectedSavedQrImageUrl = useMemo(() => {
    if (!selectedSavedUrl) return "";
    const size = qrScale === 1.5 ? 540 : 360;
    return `/api/qr?size=${size}&margin=10&data=${encodeURIComponent(selectedSavedUrl)}`;
  }, [qrScale, selectedSavedUrl]);

  const selectedSavedQrDownloadUrl = useMemo(() => {
    if (!selectedSavedUrl) return "";
    return `/api/qr?size=1200&margin=20&data=${encodeURIComponent(selectedSavedUrl)}`;
  }, [selectedSavedUrl]);

  useEffect(() => {
    if (!isQrOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsQrOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isQrOpen]);

  useEffect(() => {
    if (!isSavedQrOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsSavedQrOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSavedQrOpen]);

  useEffect(() => {
    if (!selectedSavedSlug) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSelectedSavedSlug(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedSavedSlug]);

  useEffect(() => {
    let mounted = true;

    async function loadStats() {
      try {
        const response = await fetch("/api/stats");
        const data = (await response.json()) as StatsResult;

        if (!mounted || !response.ok) {
          return;
        }

        setStats({
          totalCount: data.totalCount ?? 0,
          createdCount: data.createdCount ?? 0,
          activeCount: data.activeCount ?? 0,
          deletedCount: data.deletedCount ?? 0,
          commitHash: data.commitHash ?? "",
        });
      } catch {
        // 통계는 보조 정보이므로 조용히 무시합니다.
      }
    }

    void loadStats();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const currentSlug = result?.slug;
    if (!currentSlug) {
      setLinkStats({
        clickCount: 0,
        recentVisitors: 0,
        todayVisitors: 0,
      });
      return;
    }

    let mounted = true;

    async function loadLinkStats() {
      try {
        const response = await fetch(`/api/link-stats/${currentSlug}`);
        const data = (await response.json()) as LinkStatsResult;

        if (!mounted || !response.ok) {
          return;
        }

        setLinkStats({
          clickCount: data.clickCount ?? 0,
          recentVisitors: data.recentVisitors ?? 0,
          todayVisitors: data.todayVisitors ?? 0,
        });
      } catch {
        // 링크별 통계는 보조 정보이므로 조용히 무시합니다.
      }
    }

    void loadLinkStats();
    const timer = window.setInterval(() => {
      void loadLinkStats();
    }, 30000);

    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, [result?.slug]);

  useEffect(() => {
    if (!savedLinks.length) {
      setSavedLinkStats({});
      return;
    }

    let mounted = true;

    async function loadSavedLinkStats() {
      const entries = await Promise.all(
        savedLinks.map(async (link) => {
          try {
            const response = await fetch(`/api/link-stats/${link.slug}`);
            const data = (await response.json()) as LinkStatsResult;
            if (!response.ok) return null;

            return [
              link.slug,
              {
                clickCount: data.clickCount ?? 0,
                recentVisitors: data.recentVisitors ?? 0,
                todayVisitors: data.todayVisitors ?? 0,
                isActive: data.isActive,
                expiresAt: data.expiresAt,
              },
            ] as const;
          } catch {
            return null;
          }
        }),
      );

      if (!mounted) return;

      const nextStats: Record<string, SavedLinkStats> = {};
      for (const entry of entries) {
        if (!entry) continue;
        nextStats[entry[0]] = entry[1];
      }
      setSavedLinkStats(nextStats);

      const filteredLinks = savedLinks.filter((link) => {
        const statsForLink = nextStats[link.slug];
        if (statsForLink && statsForLink.isActive === false) return false;
        if (isExpired(statsForLink?.expiresAt ?? link.expiresAt)) return false;
        return true;
      });

      if (filteredLinks.length !== savedLinks.length) {
        setSavedLinks(filteredLinks);
        writeSavedLinks(filteredLinks);
      }
    }

    void loadSavedLinkStats();
    const timer = window.setInterval(() => {
      void loadSavedLinkStats();
    }, 30000);

    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, [savedLinks]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");
    setResult(null);
    setCopyLabel("복사");
    setIsQrOpen(false);
    setIsSavedQrOpen(false);
    setQrScale(1);

    const form = event.currentTarget;
    const formData = new FormData(form);
    const payload = {
      destination: String(formData.get("destination") ?? ""),
      retentionPeriod: String(formData.get("retentionPeriod") ?? "week") as RetentionPeriod,
    };

    try {
      const response = await fetch("/api/shorten", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const rawText = await response.text();
      const data = rawText ? (JSON.parse(rawText) as CreateResult | ErrorResult) : null;

      if (!response.ok) {
        const message = data && "error" in data ? data.error : undefined;
        throw new Error(message ?? "단축링크를 만들지 못했습니다.");
      }

      if (!data || !("shortUrl" in data)) {
        throw new Error("서버 응답을 확인하지 못했습니다.");
      }

      setResult(data);
      setLinkStats({
        clickCount: 0,
        recentVisitors: 0,
        todayVisitors: 0,
      });
      const nextSaved: SavedLink = {
        ...data,
        savedAt: new Date().toISOString(),
      };
      const merged = [
        nextSaved,
        ...readSavedLinks().filter((link) => link.slug !== nextSaved.slug && !isExpired(link.expiresAt)),
      ].slice(0, MAX_SAVED_LINKS);
      setSavedLinks(merged);
      writeSavedLinks(merged);
      window.localStorage.setItem(LAST_RESULT_KEY, JSON.stringify(data));
      await loadMyLinks();
      form.reset();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "예상치 못한 오류가 발생했습니다.";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCopy() {
    if (!resultUrl) return;

    try {
      await navigator.clipboard.writeText(resultUrl);
      setCopyLabel("복사됨");
      window.setTimeout(() => setCopyLabel("복사"), 1600);
    } catch {
      setCopyLabel("실패");
      window.setTimeout(() => setCopyLabel("복사"), 1600);
    }
  }

  async function copySavedLink(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopyLabel("복사됨");
      window.setTimeout(() => setCopyLabel("복사"), 1600);
    } catch {
      setCopyLabel("실패");
      window.setTimeout(() => setCopyLabel("복사"), 1600);
    }
  }

  function removeSavedLink(slug: string) {
    const confirmed = window.confirm("이 링크를 내 목록에서 삭제할까요?");
    if (!confirmed) return;

    const filtered = savedLinks.filter((link) => link.slug !== slug);
    setSavedLinks(filtered);
    writeSavedLinks(filtered);
    if (selectedSavedSlug === slug) {
      setSelectedSavedSlug(null);
    }
    if (result?.slug === slug) {
      setResult(null);
      window.localStorage.removeItem(LAST_RESULT_KEY);
    }
  }

  return (
    <main className="shell shell-home">
      <section className="panel panel-home">
        <div className="panel-decoration panel-decoration-left" aria-hidden="true" />
        <div className="panel-decoration panel-decoration-right" aria-hidden="true" />

        <section className="hero-overview">
          <header className="brand-bar">
            <Image
              className="brand-logo"
              src="/samlink-logo.svg"
              alt="샘링크 로고"
              width={320}
              height={92}
              priority
            />
          </header>

          <aside className="feature-brief" aria-label="샘링크 기능 안내">
            <div className="feature-brief-list">
              <span className="feature-brief-pill">단축 링크·QR 즉시 생성</span>
              <span className="feature-brief-pill">브라우저 기반 링크 보관</span>
              <span className="feature-brief-pill">링크별 방문 통계 확인</span>
            </div>
          </aside>
        </section>

        <form className="stack" onSubmit={handleSubmit}>
          <label className="label">
            <span>원본 주소</span>
            <input
              className="field"
              name="destination"
              type="url"
              placeholder="https://example.com/some/very/long/path"
              required
            />
          </label>

          <label className="label">
            <span>유지 기간</span>
            <select className="field" name="retentionPeriod" defaultValue="week" required>
              <option value="day">1일</option>
              <option value="week">1주일</option>
              <option value="month">1개월</option>
              <option value="quarter">3개월</option>
            </select>
          </label>

          <button className="submit" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "만드는 중..." : "단축링크 만들기"}
          </button>
        </form>

        <section className="result-card" aria-live="polite">
          <div className="result-head result-head-primary">
            <span className="result-tip">생성 형식: {BRAND_DOMAIN}/코드4자</span>
          </div>

          {result ? (
            <div className="result-stack">
              <div className="result-row">
                <a className="result-link" href={result.shortUrl} target="_blank" rel="noreferrer">
                  {resultUrl}
                </a>
                <button
                  className="copy-button"
                  type="button"
                  onClick={handleCopy}
                  aria-label="단축링크 복사"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M9 9a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2z" />
                    <path d="M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1" />
                  </svg>
                  <span>{copyLabel}</span>
                </button>
              </div>

              <button className="qr-launch" type="button" onClick={() => setIsQrOpen(true)}>
                <div className="qr-launch-copy">
                  <span className="qr-launch-label">QR 코드 보기</span>
                  <span className="qr-launch-hint">누르면 크게 열립니다</span>
                </div>
                <img className="qr-thumb" src={qrImageUrl} alt="단축링크 QR 코드" />
              </button>

              {result.expiresAt ? (
                <p className="result-meta">만료 예정: {formatDateTime(result.expiresAt)}</p>
              ) : null}

              <div className="public-footer-banner" aria-label="방금 만든 링크 통계">
                <div className="banner-card">
                  <span className="banner-label">총 클릭 수</span>
                  <strong>{linkStats.clickCount}</strong>
                  <span className="banner-subtext">누적 기준</span>
                </div>
                <div className="banner-card">
                  <span className="banner-label">최근 5분 접속</span>
                  <strong>{linkStats.recentVisitors}</strong>
                  <span className="banner-subtext">유니크 방문자 기준</span>
                </div>
                <div className="banner-card">
                  <span className="banner-label">오늘 방문자 수</span>
                  <strong>{linkStats.todayVisitors}</strong>
                  <span className="banner-subtext">유니크 방문자 기준</span>
                </div>
              </div>
            </div>
          ) : null}
        </section>

        <section className="my-links-card" aria-live="polite">
          <div className="result-head">
            <strong>내가 만든 링크</strong>
            <span className="result-tip">이 브라우저에서 만든 최근 링크를 다시 보여줍니다.</span>
          </div>

          {isLoadingMyLinks ? (
            <p className="empty-result">불러오는 중...</p>
          ) : myLinks.length ? (
            <div className="my-links-list">
              {visibleMyLinks.map((link) => {
                const shortUrl = link.displayShortUrl ?? link.shortUrl;
                const isExpired = link.expiresAt ? new Date(link.expiresAt).getTime() <= Date.now() : false;
                const statusLabel = !link.isActive ? "비활성" : isExpired ? "만료됨" : "사용 가능";

                return (
                  <article className="my-link-item" key={link.slug}>
                    <div className="my-link-main">
                      <a className="my-link-url" href={link.shortUrl} target="_blank" rel="noreferrer">
                        {shortUrl}
                      </a>
                      <span className={link.isActive && !isExpired ? "my-link-status active" : "my-link-status"}>
                        {statusLabel}
                      </span>
                    </div>
                    <p className="my-link-destination">{link.destination}</p>
                    <p className="my-link-meta">
                      생성 {formatDateTime(link.createdAt)}
                      {link.expiresAt ? ` · 만료 ${formatDateTime(link.expiresAt)}` : ""}
                    </p>
                  </article>
                );
              })}
              {myLinks.length > 3 ? (
                <button
                  className="my-links-toggle"
                  type="button"
                  onClick={() => setIsMyLinksExpanded((current) => !current)}
                >
                  {isMyLinksExpanded ? "접기" : `더 보기 ${hiddenMyLinkCount}개`}
                </button>
              ) : null}
            </div>
          ) : (
            <p className="empty-result">이 브라우저에서 만든 링크가 아직 없습니다.</p>
          )}
        </section>

        {error ? <p className="error">{error}</p> : null}

        <section className="result-card" aria-label="내가 만든 링크">
          <div className="result-head">
            <strong>내가 만든 링크</strong>
            <span className="result-tip">이 브라우저에 저장된 최근 링크</span>
          </div>

          {savedLinks.length ? (
            <div className="saved-links-list">
              {savedLinks.map((link) => {
                const linkUrl = link.displayShortUrl ?? link.shortUrl;
                const statsForLink = savedLinkStats[link.slug];

                return (
                  <button
                    className="saved-link-item"
                    type="button"
                    key={link.slug}
                    onClick={() => setSelectedSavedSlug(link.slug)}
                  >
                    <div className="saved-link-item-main">
                      <strong>{linkUrl}</strong>
                      <span>{link.destination}</span>
                    </div>
                    <div className="saved-link-item-meta">
                      <span>클릭 {statsForLink?.clickCount ?? 0}</span>
                      <span>최근 5분 {statsForLink?.recentVisitors ?? 0}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="empty-result">
              아직 이 브라우저에 저장된 링크가 없습니다. 링크를 만들면 자동으로 여기에 쌓입니다.
            </p>
          )}
        </section>

        <div className="public-footer-banner" aria-label="샘링크 통계">
          <div className="banner-card">
            <span className="banner-label">누적 생성 주소</span>
            <strong>{stats.createdCount}</strong>
            <span className="banner-subtext">삭제된 주소까지 포함</span>
          </div>
          <div className="banner-card">
            <span className="banner-label">활성 링크 수</span>
            <strong>{stats.activeCount}</strong>
            <span className="banner-subtext">활성 링크 기준</span>
          </div>
          <div className="banner-card">
            <span className="banner-label">자동 삭제됨</span>
            <strong>{stats.deletedCount}</strong>
            <span className="banner-subtext">만료 후 정리된 수</span>
          </div>
        </div>

        <p className="warning-note">
          오용과 남용을 막기 위해 과도한 생성, 자동화된 요청, 비정상적인 사용은 제한될 수 있습니다.
        </p>

        <a
          className="project-banner"
          href="https://끄적끄적아지트.site"
          target="_blank"
          rel="noreferrer"
          aria-label="끄적끄적아지트 사이트로 이동"
        >
          <span className="project-banner-kicker">연결 사이트</span>
          <strong>선생님이 만든 초등학생 글쓰기 통합 플랫폼</strong>
          <span className="project-banner-link">끄적끄적아지트.site</span>
        </a>

        <a
          className="project-banner"
          href="https://survival.xn--vz0ba242ncqcba79xhwx.site/"
          target="_blank"
          rel="noreferrer"
          aria-label="문해력서바이벌 사이트로 이동"
        >
          <span className="project-banner-kicker">연결 사이트</span>
          <strong>자리배치, 역할배치, 자리배치 기반 문해력 활동 웹앱 문해력 서바이벌</strong>
          <span className="project-banner-link">survival.끄적끄적아지트.site</span>
        </a>

      </section>

      <footer className="site-footer" aria-label="사업자 정보">
        상호명: 끄적끄적 아지트 | 운영책임자: 유승현 | 문의: <a href="mailto:yshgg@naver.com">yshgg@naver.com</a> | © 2026 끄적끄적 아지트. All rights reserved.
      </footer>

      {isQrOpen && resultUrl ? (
        <div className="qr-overlay" role="presentation" onClick={() => setIsQrOpen(false)}>
          <div
            className="qr-modal"
            role="dialog"
            aria-modal="true"
            aria-label="QR 코드 크게 보기"
            onClick={(event) => event.stopPropagation()}
          >
            <button className="qr-close" type="button" onClick={() => setIsQrOpen(false)} aria-label="QR 코드 닫기">
              닫기
            </button>
            <a className="qr-download" href={qrDownloadUrl} download={`samlink-qr-${result?.slug ?? "code"}.png`}>
              다운로드
            </a>
            <p className="qr-modal-title">단축링크 QR 코드</p>
            <div className="qr-size-controls" aria-label="QR 코드 크기 선택">
              <button
                className={qrScale === 1 ? "qr-size-option is-active" : "qr-size-option"}
                type="button"
                onClick={() => setQrScale(1)}
                aria-pressed={qrScale === 1}
              >
                기본
              </button>
              <button
                className={qrScale === 1.5 ? "qr-size-option is-active" : "qr-size-option"}
                type="button"
                onClick={() => setQrScale(1.5)}
                aria-pressed={qrScale === 1.5}
              >
                1.5배 크게
              </button>
            </div>
            <img
              className={qrScale === 1.5 ? "qr-modal-image is-large" : "qr-modal-image"}
              src={qrModalImageUrl}
              alt="단축링크 QR 코드 크게 보기"
            />
            <p className="qr-modal-link">{resultUrl}</p>
          </div>
        </div>
      ) : null}
      {selectedSavedLink ? (
        <div className="qr-overlay" role="presentation" onClick={() => setSelectedSavedSlug(null)}>
          <div
            className="qr-modal saved-link-modal"
            role="dialog"
            aria-modal="true"
            aria-label="저장된 링크 정보"
            onClick={(event) => event.stopPropagation()}
          >
            <button className="qr-close" type="button" onClick={() => setSelectedSavedSlug(null)} aria-label="링크 정보 닫기">
              닫기
            </button>
            <p className="qr-modal-title">저장된 링크 정보</p>
            <a
              className="result-link saved-link-modal-url"
              href={selectedSavedLink.shortUrl}
              target="_blank"
              rel="noreferrer"
            >
              {selectedSavedUrl}
            </a>
            <p className="result-meta">원본 주소: {selectedSavedLink.destination}</p>
            <p className="result-meta">
              만료 예정: {formatDateTime(selectedSavedStats?.expiresAt ?? selectedSavedLink.expiresAt)}
            </p>
            <p className="result-meta">저장한 시각: {formatDateTime(selectedSavedLink.savedAt)}</p>
            <div className="saved-link-qr-header">
              <strong>QR 코드</strong>
              <div className="saved-link-actions">
                <button className="mini-button" type="button" onClick={() => setIsSavedQrOpen(true)}>
                  QR 코드 보기
                </button>
                <a
                  className="mini-button"
                  href={selectedSavedQrDownloadUrl}
                  download={`samlink-qr-${selectedSavedLink.slug}.png`}
                >
                  다운로드
                </a>
              </div>
            </div>
            <div className="public-footer-banner" aria-label={`${selectedSavedLink.slug} 링크 통계`}>
              <div className="banner-card">
                <span className="banner-label">총 클릭 수</span>
                <strong>{selectedSavedStats?.clickCount ?? 0}</strong>
                <span className="banner-subtext">누적 기준</span>
              </div>
              <div className="banner-card">
                <span className="banner-label">최근 5분 접속</span>
                <strong>{selectedSavedStats?.recentVisitors ?? 0}</strong>
                <span className="banner-subtext">같은 브라우저는 1명</span>
              </div>
              <div className="banner-card">
                <span className="banner-label">오늘 방문자 수</span>
                <strong>{selectedSavedStats?.todayVisitors ?? 0}</strong>
                <span className="banner-subtext">쿠키 기준 방문자</span>
              </div>
            </div>
            <div className="saved-link-actions">
              <button
                className="mini-button"
                type="button"
                onClick={() => copySavedLink(selectedSavedUrl)}
              >
                복사
              </button>
              <button
                className="mini-button danger"
                type="button"
                onClick={() => removeSavedLink(selectedSavedLink.slug)}
              >
                삭제하기
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {selectedSavedLink && isSavedQrOpen ? (
        <div className="qr-overlay" role="presentation" onClick={() => setIsSavedQrOpen(false)}>
          <div
            className="qr-modal"
            role="dialog"
            aria-modal="true"
            aria-label="저장된 링크 QR 코드 크게 보기"
            onClick={(event) => event.stopPropagation()}
          >
            <button className="qr-close" type="button" onClick={() => setIsSavedQrOpen(false)} aria-label="QR 코드 닫기">
              닫기
            </button>
            <a
              className="qr-download"
              href={selectedSavedQrDownloadUrl}
              download={`samlink-qr-${selectedSavedLink.slug}.png`}
            >
              다운로드
            </a>
            <p className="qr-modal-title">저장된 링크 QR 코드</p>
            <div className="qr-size-controls" aria-label="QR 코드 크기 선택">
              <button
                className={qrScale === 1 ? "qr-size-option is-active" : "qr-size-option"}
                type="button"
                onClick={() => setQrScale(1)}
                aria-pressed={qrScale === 1}
              >
                기본
              </button>
              <button
                className={qrScale === 1.5 ? "qr-size-option is-active" : "qr-size-option"}
                type="button"
                onClick={() => setQrScale(1.5)}
                aria-pressed={qrScale === 1.5}
              >
                1.5배 크게
              </button>
            </div>
            <img
              className={qrScale === 1.5 ? "qr-modal-image is-large" : "qr-modal-image"}
              src={selectedSavedQrImageUrl}
              alt="저장된 링크 QR 코드 크게 보기"
            />
            <p className="qr-modal-link">{selectedSavedUrl}</p>
          </div>
        </div>
      ) : null}

      {stats.commitHash ? (
        <div style={{
          position: "fixed",
          bottom: "12px",
          right: "12px",
          fontSize: "11px",
          color: "rgba(100, 116, 139, 0.8)",
          backgroundColor: "rgba(241, 245, 249, 0.9)",
          border: "1px solid rgba(226, 232, 240, 0.8)",
          padding: "3px 8px",
          borderRadius: "6px",
          pointerEvents: "none",
          zIndex: 9999,
          fontFamily: "var(--font-mono, monospace)",
          boxShadow: "0 1px 2px rgba(0, 0, 0, 0.05)",
          display: "flex",
          alignItems: "center",
          gap: "4px",
        }}>
          <span style={{ display: "inline-block", width: "6px", height: "6px", borderRadius: "50%", backgroundColor: "#10b981" }} />
          commit: {stats.commitHash}
        </div>
      ) : null}
    </main>
  );
}
