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
  error?: string;
};

type RetentionPeriod = "day" | "week" | "month";

const BRAND_DOMAIN = "샘링크.kr";

function formatDateTime(value?: string) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default function HomePage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<CreateResult | null>(null);
  const [error, setError] = useState("");
  const [copyLabel, setCopyLabel] = useState("복사");
  const [isQrOpen, setIsQrOpen] = useState(false);
  const [stats, setStats] = useState({
    totalCount: 0,
    createdCount: 0,
    activeCount: 0,
    deletedCount: 0,
  });

  const resultUrl = result?.displayShortUrl ?? result?.shortUrl ?? "";

  const qrImageUrl = useMemo(() => {
    if (!resultUrl) return "";
    return `https://api.qrserver.com/v1/create-qr-code/?size=360x360&margin=10&data=${encodeURIComponent(resultUrl)}`;
  }, [resultUrl]);

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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");
    setResult(null);
    setCopyLabel("복사");
    setIsQrOpen(false);

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

  return (
    <main className="shell shell-home">
      <section className="panel panel-home">
        <div className="panel-decoration panel-decoration-left" aria-hidden="true" />
        <div className="panel-decoration panel-decoration-right" aria-hidden="true" />

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
              <option value="month">1달</option>
            </select>
          </label>

          <button className="submit" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "만드는 중..." : "단축링크 만들기"}
          </button>
        </form>

        <section className="result-card" aria-live="polite">
          <div className="result-head">
            <strong>생성된 단축 링크</strong>
            <span className="result-tip">기본 형식: {BRAND_DOMAIN}/코드4자</span>
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
            </div>
          ) : (
            <p className="empty-result">
              아직 생성된 링크가 없습니다. 주소를 입력하면 바로 짧은 주소로 바꿔드립니다.
            </p>
          )}
        </section>

        {error ? <p className="error">{error}</p> : null}

        <div className="help">
          <div className="help-chip">기본 코드 길이 4자리</div>
          <p>자동 생성 코드는 4자리로 만들고, 선택한 기간이 지나면 DB에서 자동으로 정리됩니다.</p>
        </div>

        <p className="warning-note">
          오용과 남용을 막기 위해 과도한 생성, 자동화된 요청, 비정상적인 사용은 제한될 수 있습니다.
        </p>

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
      </section>

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
            <p className="qr-modal-title">단축링크 QR 코드</p>
            <img className="qr-modal-image" src={qrImageUrl} alt="단축링크 QR 코드 크게 보기" />
            <p className="qr-modal-link">{resultUrl}</p>
          </div>
        </div>
      ) : null}
    </main>
  );
}
