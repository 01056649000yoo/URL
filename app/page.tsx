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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");
    setResult(null);

    const form = event.currentTarget;
    const formData = new FormData(form);
    const payload = {
      destination: String(formData.get("destination") ?? ""),
      slug: String(formData.get("slug") ?? ""),
      adminToken: String(formData.get("adminToken") ?? ""),
      createdBy: String(formData.get("createdBy") ?? ""),
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

  return (
    <main className="shell">
      <section className="panel">
        <div className="intro">
          <p className="eyebrow">개인용 URL 단축기</p>
          <h1>긴 주소를 짧게 바꿔보세요</h1>
          <p className="lead">자주 공유하는 링크를 짧은 주소로 만들고 바로 사용할 수 있습니다.</p>
          <p className="format">생성 형식: `도메인/slug`</p>
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

          <div className="row">
            <label className="label">
              <span>짧은 주소 이름</span>
              <input
                className="field"
                name="slug"
                type="text"
                placeholder="naver"
                pattern="[a-zA-Z0-9-_]+"
              />
            </label>

            <label className="label">
              <span>메모</span>
              <input className="field" name="createdBy" type="text" placeholder="선택 사항" />
            </label>
          </div>

          <label className="label">
            <span>관리자 토큰</span>
            <input
              className="field"
              name="adminToken"
              type="password"
              placeholder="설정한 관리자 토큰 입력"
              required
            />
          </label>

          <button className="submit" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "만드는 중..." : "단축 링크 만들기"}
          </button>
        </form>

        {result ? (
          <div className="result">
            <strong>생성된 주소</strong>
            <a href={result.shortUrl} target="_blank" rel="noreferrer">
              {result.shortUrl}
            </a>
          </div>
        ) : null}

        {error ? <p className="error">{error}</p> : null}

        <div className="help">
          <p>입력한 원본 주소는 Supabase에 저장되고, 짧은 주소로 접속하면 자동으로 이동합니다.</p>
        </div>
      </section>
    </main>
  );
}
