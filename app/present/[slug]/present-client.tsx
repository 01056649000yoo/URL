"use client";

import { useEffect, useMemo, useRef, useState } from "react";

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
  const [targetInput, setTargetInput] = useState("");
  const [targetCount, setTargetCount] = useState<number | null>(null);
  // 목표 인원 알림(2026-11-03 선생님 결정): 처음 닿는 순간 위쪽 띠 + '띵동' 한 번. 소리는 처음부터 켬.
  const [soundOn, setSoundOn] = useState(true);
  const [goalBanner, setGoalBanner] = useState(false);
  const goalReached = useRef(false);
  const audioContext = useRef<AudioContext | null>(null);

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

  // 브라우저는 화면을 누른 뒤에만 소리를 허락하므로, '적용'을 누를 때 소리 장치를 깨워 둔다.
  function unlockSound() {
    try {
      const AudioCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtor) return;
      audioContext.current ??= new AudioCtor();
      void audioContext.current.resume();
    } catch {
      // 소리를 못 내도 화면 알림은 뜬다.
    }
  }

  function playChime() {
    const context = audioContext.current;
    if (!context) return;
    const start = context.currentTime + 0.02;
    for (const [index, frequency] of [880, 659].entries()) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const at = start + index * 0.32;
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, at);
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.35, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.6);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(at);
      oscillator.stop(at + 0.65);
    }
  }

  function applyTargetCount() {
    const value = Number.parseInt(targetInput, 10);
    if (!Number.isInteger(value) || value < 1 || value > 999) return;
    unlockSound();
    goalReached.current = false;
    setGoalBanner(false);
    setTargetCount(value);
    setTargetInput("");
  }

  const attendanceComplete = targetCount !== null && (recentVisitors ?? 0) >= targetCount;

  // 목표에 처음 닿는 순간 한 번만 알린다(접속 수가 잠깐 줄었다 다시 늘어도 같은 목표면 다시 울리지 않음).
  useEffect(() => {
    if (!attendanceComplete || goalReached.current) return;
    goalReached.current = true;
    setGoalBanner(true);
    if (soundOn) playChime();
    // playChime·soundOn 은 울리는 순간의 값만 쓴다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attendanceComplete]);

  // 띠는 8초 뒤 저절로 닫힌다(접속 수가 그 사이 바뀌어도 타이머는 그대로).
  useEffect(() => {
    if (!goalBanner) return;
    const timer = window.setTimeout(() => setGoalBanner(false), 8000);
    return () => window.clearTimeout(timer);
  }, [goalBanner]);

  return (
    <main className={goalBanner ? "present-shell has-goal-banner" : "present-shell"}>
      {goalBanner && targetCount ? (
        <div className="present-goal-banner" role="status">
          <span>🎉 목표 인원 <strong>{targetCount}명</strong>이 모두 들어왔어요!</span>
          <button type="button" onClick={() => setGoalBanner(false)}>닫기</button>
        </div>
      ) : null}
      <button className="present-fullscreen" type="button" onClick={toggleFullscreen}>
        {isFullscreen ? "전체화면 나가기" : "⛶ 전체화면"}
      </button>

      <section className="present-stage">
        {qrSrc ? <img className="present-qr" src={qrSrc} alt={`${displayUrl} QR 코드`} /> : null}
        <p className="present-url">{displayUrl}</p>
        {canSeeStats ? (
          <>
            <p className={attendanceComplete ? "present-counter is-complete" : "present-counter"} aria-live="polite">
              <span className="present-counter-dot" aria-hidden="true" />
              {targetCount ? (
                <>{attendanceComplete ? "✅ 입장 완료 " : "접속 "}<strong>{recentVisitors ?? 0} / {targetCount}</strong>명</>
              ) : (
                <>최근 5분 접속 <strong>{recentVisitors ?? 0}</strong>명</>
              )}
            </p>
            <div className="present-target-control">
              <label htmlFor="present-target">목표 인원</label>
              <input id="present-target" inputMode="numeric" pattern="[0-9]*" value={targetInput} placeholder="예: 28" onChange={(event) => setTargetInput(event.target.value.replace(/\D/g, "").slice(0, 3))} onKeyDown={(event) => { if (event.key === "Enter") applyTargetCount(); }} />
              <button type="button" onClick={applyTargetCount}>적용</button>
              {targetCount ? <button type="button" className="present-target-clear" onClick={() => { setTargetCount(null); setGoalBanner(false); goalReached.current = false; }}>해제</button> : null}
              <button
                type="button"
                className="present-sound-toggle"
                aria-pressed={soundOn}
                onClick={() => { if (!soundOn) unlockSound(); setSoundOn((on) => !on); }}
                title="목표 인원에 닿으면 '띵동' 소리를 한 번 냅니다."
              >
                {soundOn ? "🔔 소리 켬" : "🔕 소리 끔"}
              </button>
            </div>
          </>
        ) : null}
        <p className="present-hint">휴대폰 카메라로 QR을 찍거나, 주소를 그대로 입력하세요</p>
      </section>
    </main>
  );
}
