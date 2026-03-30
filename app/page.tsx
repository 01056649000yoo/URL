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
          <p className="eyebrow">끄적끄적아지트 단축 링크</p>
          <h1>긴 주소를 귀엽고 빠르게 줄여보세요</h1>
          <p className="lead">
            원본 주소와 관리자 토큰만 입력하면 바로 짧은 링크를 만들어 드립니다.
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
            <span className="result-tip">기본 형식: `go.끄적끄적아지트.site/slug`</span>
          </div>

          {result ? (
            <div className="result-row">
              <a className="result-link" href={result.shortUrl} target="_blank" rel="noreferrer">
                {result.shortUrl}
              </a>
              <button className="copy-button" type="button" onClick={handleCopy} aria-label="단축 링크 복사">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M9 9a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2z" />
                  <path d="M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1" />
                </svg>
                <span>{copyLabel}</span>
              </button>
            </div>
          ) : (
            <p className="empty-result">아직 생성된 링크가 없습니다. 위에서 주소를 입력해 보세요.</p>
          )}
        </section>

        {error ? <p className="error">{error}</p> : null}

        <div className="help">
          <div className="help-chip">발랄한 공유용</div>
          <p>생성된 링크는 바로 열 수 있고, 복사 버튼으로 빠르게 전달할 수 있습니다.</p>
        </div>
      </section>
    </main>
  );
}
