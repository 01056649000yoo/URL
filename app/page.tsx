"use client";

import { FormEvent, useState } from "react";

type CreateResult = {
  shortUrl: string;
  slug: string;
  destination: string;
};

type ErrorResult = {
  error?: string;
};

const BRAND_NAME = "쌤링크";
const BRAND_DOMAIN = "쌤링크.kr";

export default function HomePage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<CreateResult | null>(null);
  const [error, setError] = useState("");
  const [copyLabel, setCopyLabel] = useState("복사");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");
    setResult(null);
    setCopyLabel("복사");

    const form = event.currentTarget;
    const formData = new FormData(form);
    const payload = {
      destination: String(formData.get("destination") ?? ""),
      adminToken: String(formData.get("adminToken") ?? ""),
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
        throw new Error(message ?? "단축 링크를 만들지 못했습니다.");
      }

      if (!data || !("shortUrl" in data)) {
        throw new Error("서버 응답을 확인하지 못했습니다.");
      }

      setResult(data);
      form.reset();
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : "알 수 없는 오류가 발생했습니다.";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCopy() {
    if (!result) {
      return;
    }

    try {
      await navigator.clipboard.writeText(result.shortUrl);
      setCopyLabel("복사됨");
      window.setTimeout(() => setCopyLabel("복사"), 1600);
    } catch {
      setCopyLabel("실패");
      window.setTimeout(() => setCopyLabel("복사"), 1600);
    }
  }

  return (
    <main className="shell">
      <section className="panel">
        <div className="panel-decoration panel-decoration-left" aria-hidden="true" />
        <div className="panel-decoration panel-decoration-right" aria-hidden="true" />

        <div className="intro">
          <p className="eyebrow">{BRAND_NAME}</p>
          <h1>원본 주소만 넣으면 4자리 코드 링크가 바로 만들어져요</h1>
          <p className="lead">
            수업, 자료, 공지 링크를 빠르게 줄여서 공유할 수 있게 만든 가벼운 단축기입니다.
          </p>
        </div>

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
            <span>관리자 토큰</span>
            <input
              className="field"
              name="adminToken"
              type="password"
              placeholder="관리자 토큰을 입력해 주세요"
              required
            />
          </label>

          <button className="submit" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "링크 만드는 중..." : "단축 링크 만들기"}
          </button>
        </form>

        <section className="result-card" aria-live="polite">
          <div className="result-head">
            <strong>생성된 단축 링크</strong>
            <span className="result-tip">기본 형식: {BRAND_DOMAIN}/코드4자</span>
          </div>

          {result ? (
            <div className="result-row">
              <a className="result-link" href={result.shortUrl} target="_blank" rel="noreferrer">
                {result.shortUrl}
              </a>
              <button
                className="copy-button"
                type="button"
                onClick={handleCopy}
                aria-label="단축 링크 복사"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M9 9a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2z" />
                  <path d="M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1" />
                </svg>
                <span>{copyLabel}</span>
              </button>
            </div>
          ) : (
            <p className="empty-result">
              아직 생성된 링크가 없습니다. 주소를 입력하면 4자리 코드가 자동으로 붙습니다.
            </p>
          )}
        </section>

        {error ? <p className="error">{error}</p> : null}

        <div className="help">
          <div className="help-chip">기본 코드 길이 4자</div>
          <p>
            자동 생성 코드는 4자리로 만들어지고, 복사 버튼으로 바로 전달할 수 있습니다.
          </p>
        </div>
      </section>
    </main>
  );
}
