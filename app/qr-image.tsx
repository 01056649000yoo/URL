"use client";

import { useEffect, useState } from "react";

// QR 그림을 못 받아오면(잠깐의 네트워크 문제·횟수 제한 등) 깨진 그림 대신 안내를 보이고 저절로 다시 받는다(2026-11-03).
// 처음 두 번은 1.5초 뒤, 그 뒤로는 10초마다. 성공하면 안내가 사라진다. 버튼 안에서도 쓸 수 있게 안내는 글자만.
export function RetryingQrImage({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setAttempt(0);
    setFailed(false);
  }, [src]);

  useEffect(() => {
    if (!failed) return;
    const timer = window.setTimeout(() => setAttempt((value) => value + 1), attempt < 2 ? 1500 : 10000);
    return () => window.clearTimeout(timer);
  }, [failed, attempt]);

  const url = attempt ? `${src}${src.includes("?") ? "&" : "?"}retry=${attempt}` : src;

  return (
    <>
      <img
        className={className}
        src={url}
        alt={alt}
        style={failed ? { display: "none" } : undefined}
        onLoad={() => setFailed(false)}
        onError={() => setFailed(true)}
      />
      {failed ? (
        <span className="qr-fallback" role="status">
          <strong>QR을 불러오지 못했어요</strong>
          <small>잠시 뒤 저절로 다시 불러와요</small>
        </span>
      ) : null}
    </>
  );
}
