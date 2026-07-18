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
  label?: string;
};

type MergedLink = {
  slug: string;
  shortUrl: string;
  displayShortUrl?: string;
  destination: string;
  label?: string;
  expiresAt?: string | null;
  isActive?: boolean;
  sortAt?: string;
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

// 만료 7일 전부터 D-day 배지를 보여줍니다 (3일 이하는 강조).
function getExpiryBadge(value?: string | null): { text: string; urgent: boolean } | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return null;

  const remaining = time - Date.now();
  if (remaining <= 0) return { text: "만료됨", urgent: true };

  const days = Math.ceil(remaining / (24 * 60 * 60 * 1000));
  if (days > 7) return null;
  return { text: days <= 1 ? "오늘 만료" : `D-${days}`, urgent: days <= 3 };
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// 제목 + QR + 짧은 주소가 들어간 A4 인쇄용 창을 엽니다. 제목은 인쇄 전 클릭해서 바로 고칠 수 있습니다.
function openQrPrintView(url: string, title: string, slug: string) {
  const printWindow = window.open("", "_blank", "width=820,height=1000");
  if (!printWindow) {
    alert("팝업이 차단되어 인쇄 창을 열 수 없습니다. 팝업 허용 후 다시 시도해 주세요.");
    return;
  }

  const qrSrc = `${window.location.origin}/api/qr?size=1200&margin=20&data=${encodeURIComponent(url)}`;
  const displayUrl = url.replace(/^https?:\/\//, "");
  const safeTitle = escapeHtml(title.trim() || "QR 코드를 스캔해 주세요");

  printWindow.document.write(`<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<title>샘링크 QR 인쇄 - ${escapeHtml(slug)}</title>
<style>
  @page { size: A4 portrait; margin: 18mm; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: "Pretendard", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif;
    display: flex;
    flex-direction: column;
    align-items: center;
    min-height: 100vh;
    background: #f8fafc;
    color: #0f172a;
  }
  .toolbar {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 14px;
    background: #eef2ff;
    border-bottom: 1px solid #c7d2fe;
  }
  .toolbar button {
    font-size: 16px;
    font-weight: 700;
    padding: 10px 22px;
    border: none;
    border-radius: 10px;
    background: #4f46e5;
    color: white;
    cursor: pointer;
  }
  .toolbar span { font-size: 13px; color: #4338ca; }
  .sheet {
    flex: 1;
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 28px;
    padding: 40px 24px;
    text-align: center;
  }
  h1 {
    font-size: 44px;
    font-weight: 900;
    margin: 0;
    max-width: 90%;
    line-height: 1.25;
    word-break: keep-all;
    outline-color: #4f46e5;
  }
  img { width: 62%; max-width: 480px; height: auto; }
  .short-url { font-size: 30px; font-weight: 800; color: #214ad8; margin: 0; word-break: break-all; }
  .brand { font-size: 14px; color: #64748b; margin: 0; }
  @media print {
    body { background: white; }
    .no-print { display: none !important; }
  }
</style>
</head>
<body>
  <div class="toolbar no-print">
    <button type="button" onclick="window.print()">🖨️ 인쇄하기</button>
    <span>제목을 클릭하면 인쇄 전에 바로 수정할 수 있어요</span>
  </div>
  <div class="sheet">
    <h1 contenteditable="true" spellcheck="false">${safeTitle}</h1>
    <img src="${qrSrc}" alt="QR 코드" />
    <p class="short-url">${escapeHtml(displayUrl)}</p>
    <p class="brand">샘링크 · ${escapeHtml(BRAND_DOMAIN)}</p>
  </div>
</body>
</html>`);
  printWindow.document.close();
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
  const [isEditingLabel, setIsEditingLabel] = useState(false);
  const [labelDraft, setLabelDraft] = useState("");
  const [isExtending, setIsExtending] = useState(false);
  const [extendNotice, setExtendNotice] = useState("");
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

  // 만들기 유형: 일반 단축 링크 또는 여러 주소를 묶은 링크 묶음(수업 세트)
  const [createMode, setCreateMode] = useState<"single" | "bundle">("single");
  const [customSlug, setCustomSlug] = useState("");
  const [bundleTitle, setBundleTitle] = useState("");
  const [bundleItems, setBundleItems] = useState<{ label: string; url: string }[]>([
    { label: "", url: "" },
    { label: "", url: "" },
  ]);

  // ==========================================
  // 📌 QR Code Floating Pin Mode State & Logic
  // ==========================================
  const [pinnedQrUrl, setPinnedQrUrl] = useState<string | null>(null);
  const [pinnedSlug, setPinnedSlug] = useState<string | null>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isSystemPipActive, setIsSystemPipActive] = useState(false);
  const [pinnedRecentVisitors, setPinnedRecentVisitors] = useState<number | null>(null);

  // AOT 전용 상태 (페이지 내 플로팅과 완전히 분리)
  const [isAotModalOpen, setIsAotModalOpen] = useState(false);
  const [aotModalUrl, setAotModalUrl] = useState<string | null>(null);

  const handleSystemAlwaysOnTop = async (url: string, slug: string) => {
    try {
      if (typeof window !== "undefined" && "documentPictureInPicture" in window) {
        const docPiP = (window as any).documentPictureInPicture;
        const pipWindow = await docPiP.requestWindow({ width: 260, height: 320 });

        setIsSystemPipActive(true);

        // 스타일 복사
        Array.from(document.styleSheets).forEach((styleSheet) => {
          try {
            const cssRules = Array.from(styleSheet.cssRules).map((r) => r.cssText).join("");
            const style = pipWindow.document.createElement("style");
            style.textContent = cssRules;
            pipWindow.document.head.appendChild(style);
          } catch {
            if (styleSheet.href) {
              const link = pipWindow.document.createElement("link");
              link.rel = "stylesheet";
              link.href = styleSheet.href;
              pipWindow.document.head.appendChild(link);
            }
          }
        });

        pipWindow.document.body.style.cssText = "margin:0;padding:0;overflow:hidden;background:#F8FAFC;";

        const qrImgUrl = `/api/qr?size=900&margin=10&data=${encodeURIComponent(url)}`;
        const shortLabel = url.replace(/^https?:\/\//, "");

        const container = pipWindow.document.createElement("div");
        container.style.cssText = "display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;padding:16px;box-sizing:border-box;";
        container.innerHTML = `
          <div style="background:white;border-radius:16px;padding:12px;box-shadow:0 4px 16px rgba(79,108,251,0.08);border:1px solid rgba(79,108,251,0.12);display:flex;flex-direction:column;align-items:center;width:100%;height:100%;box-sizing:border-box;gap:8px;">
            <div style="font-size:11px;font-weight:800;color:#4F46E5;flex-shrink:0;">🖥️ 샘링크 AOT</div>
            <div style="flex:1;min-height:0;width:100%;display:flex;align-items:center;justify-content:center;">
              <img src="${qrImgUrl}" style="width:100%;height:100%;object-fit:contain;border-radius:8px;" />
            </div>
            <div style="font-size:11px;font-weight:900;color:#214ad8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%;flex-shrink:0;">${shortLabel}</div>
            <div data-live-count style="font-size:11px;font-weight:800;color:#16a34a;flex-shrink:0;">👥 최근 5분 접속 확인 중...</div>
          </div>
        `;
        pipWindow.document.body.appendChild(container);

        // AOT 창에서도 실시간 입장 인원을 보여줍니다 (수업 중 확인용).
        const counter = container.querySelector("[data-live-count]") as HTMLElement | null;
        const refreshLiveCount = async () => {
          try {
            const response = await fetch(`/api/link-stats/${encodeURIComponent(slug)}`);
            if (!response.ok) {
              if (counter && (response.status === 403 || response.status === 404)) {
                counter.style.display = "none";
              }
              return;
            }
            const data = (await response.json()) as LinkStatsResult;
            if (counter) {
              counter.textContent = `👥 최근 5분 접속 ${data.recentVisitors ?? 0}명`;
            }
          } catch {
            // 일시적인 오류는 다음 주기에 다시 시도합니다.
          }
        };
        void refreshLiveCount();
        const liveCountTimer = window.setInterval(() => {
          void refreshLiveCount();
        }, 10000);

        pipWindow.addEventListener("pagehide", () => {
          window.clearInterval(liveCountTimer);
          setIsSystemPipActive(false);
        });
      } else {
        alert("항상 위에 띄우기(창시스템 고정)은 Chrome 116+ 또는 Edge에서 지원됩니다.\n하단 플로팅 고정(페이지 내 고정) 기능을 이용해주세요.");
      }
    } catch (e) {
      console.error("Document PiP 실패:", e);
    }
  };

  const handlePinQr = (url: string, slug: string) => {
    setPinnedQrUrl(url);
    setPinnedSlug(slug);
    
    // Position at top-right by default based on current window width
    if (typeof window !== "undefined") {
      const defaultX = window.innerWidth - 260;
      const defaultY = 40;
      setPosition({ x: defaultX > 10 ? defaultX : 10, y: defaultY });
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest(".drag-handle")) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
      e.preventDefault();
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if ((e.target as HTMLElement).closest(".drag-handle")) {
      const touch = e.touches[0];
      setIsDragging(true);
      setDragStart({ x: touch.clientX - position.x, y: touch.clientY - position.y });
    }
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const newX = Math.max(10, Math.min(window.innerWidth - 100, e.clientX - dragStart.x));
      const newY = Math.max(10, Math.min(window.innerHeight - 100, e.clientY - dragStart.y));
      setPosition({ x: newX, y: newY });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isDragging) return;
      const touch = e.touches[0];
      const newX = Math.max(10, Math.min(window.innerWidth - 100, touch.clientX - dragStart.x));
      const newY = Math.max(10, Math.min(window.innerHeight - 100, touch.clientY - dragStart.y));
      setPosition({ x: newX, y: newY });
    };

    const handleTouchEnd = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      window.addEventListener("touchmove", handleTouchMove, { passive: true });
      window.addEventListener("touchend", handleTouchEnd);
    }

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
    };
  }, [isDragging, dragStart]);


  // 화면에 고정된 QR의 실시간 입장 인원 (수업 중 "몇 명 들어왔나" 확인용)
  useEffect(() => {
    const currentSlug = pinnedSlug;
    if (!currentSlug) {
      setPinnedRecentVisitors(null);
      return;
    }

    let mounted = true;

    async function loadPinnedStats() {
      try {
        const response = await fetch(`/api/link-stats/${encodeURIComponent(currentSlug as string)}`);
        if (!mounted || !response.ok) return;
        const data = (await response.json()) as LinkStatsResult;
        if (!mounted) return;
        setPinnedRecentVisitors(data.recentVisitors ?? 0);
      } catch {
        // 일시적인 오류는 다음 주기에 다시 시도합니다.
      }
    }

    void loadPinnedStats();
    const timer = window.setInterval(() => {
      void loadPinnedStats();
    }, 10000);

    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, [pinnedSlug]);

  const resultUrl = result?.displayShortUrl ?? result?.shortUrl ?? "";
  const selectedSavedLink = savedLinks.find((link) => link.slug === selectedSavedSlug) ?? null;
  const selectedSavedStats = selectedSavedLink ? savedLinkStats[selectedSavedLink.slug] : null;
  const selectedSavedUrl = selectedSavedLink
    ? selectedSavedLink.displayShortUrl ?? selectedSavedLink.shortUrl
    : "";

  // 브라우저 저장 링크(별명·QR 보관)와 서버 기록(실시간 상태)을 슬러그 기준으로 하나의 목록으로 합칩니다.
  const mergedLinks = useMemo(() => {
    const map = new Map<string, MergedLink>();

    for (const link of savedLinks) {
      map.set(link.slug, {
        slug: link.slug,
        shortUrl: link.shortUrl,
        displayShortUrl: link.displayShortUrl,
        destination: link.destination,
        label: link.label,
        expiresAt: link.expiresAt,
        sortAt: link.savedAt,
      });
    }

    for (const link of myLinks) {
      const existing = map.get(link.slug);
      if (existing) {
        existing.expiresAt = link.expiresAt ?? existing.expiresAt;
        existing.isActive = link.isActive;
      } else {
        map.set(link.slug, {
          slug: link.slug,
          shortUrl: link.shortUrl,
          displayShortUrl: link.displayShortUrl,
          destination: link.destination,
          expiresAt: link.expiresAt,
          isActive: link.isActive,
          sortAt: link.createdAt,
        });
      }
    }

    return Array.from(map.values()).sort(
      (a, b) => new Date(b.sortAt ?? 0).getTime() - new Date(a.sortAt ?? 0).getTime(),
    );
  }, [savedLinks, myLinks]);

  const visibleLinks = isMyLinksExpanded ? mergedLinks : mergedLinks.slice(0, 4);
  const hiddenLinkCount = Math.max(mergedLinks.length - visibleLinks.length, 0);

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
    void fetch("/api/page-visit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "/" }),
      keepalive: true,
    }).catch(() => {});
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
        const response = await fetch(`/api/link-stats/${encodeURIComponent(currentSlug as string)}`);
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
            const response = await fetch(`/api/link-stats/${encodeURIComponent(link.slug)}`);
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
    const payload: Record<string, unknown> = {
      retentionPeriod: String(formData.get("retentionPeriod") ?? "week") as RetentionPeriod,
    };

    const trimmedSlug = customSlug.trim();
    if (trimmedSlug) {
      payload.slug = trimmedSlug;
    }

    if (createMode === "bundle") {
      payload.bundleTitle = bundleTitle;
      payload.bundleItems = bundleItems;
    } else {
      payload.destination = String(formData.get("destination") ?? "");
    }

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
      setCustomSlug("");
      setBundleTitle("");
      setBundleItems([
        { label: "", url: "" },
        { label: "", url: "" },
      ]);
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

  function openSavedLink(slug: string) {
    setSelectedSavedSlug(slug);
    setIsEditingLabel(false);
    setLabelDraft("");
    setExtendNotice("");
  }

  // 서버에만 기록된 링크(브라우저 저장 이전 생성분 등)는 클릭 시 보관함에 넣어 동일하게 관리합니다.
  function openMergedLink(link: MergedLink) {
    if (!savedLinks.some((saved) => saved.slug === link.slug)) {
      const adopted: SavedLink = {
        slug: link.slug,
        shortUrl: link.shortUrl,
        displayShortUrl: link.displayShortUrl,
        destination: link.destination,
        expiresAt: link.expiresAt ?? undefined,
        savedAt: new Date().toISOString(),
      };
      const merged = [adopted, ...savedLinks].slice(0, MAX_SAVED_LINKS);
      setSavedLinks(merged);
      writeSavedLinks(merged);
    }
    openSavedLink(link.slug);
  }

  function saveLabel(slug: string) {
    const label = labelDraft.trim().slice(0, 40);
    const updated = savedLinks.map((link) =>
      link.slug === slug ? { ...link, label: label || undefined } : link,
    );
    setSavedLinks(updated);
    writeSavedLinks(updated);
    setIsEditingLabel(false);
  }

  async function extendSavedLink(slug: string) {
    setIsExtending(true);
    setExtendNotice("");

    try {
      const response = await fetch("/api/my-links/extend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      const data = (await response.json()) as { expiresAt?: string; error?: string };

      if (!response.ok || !data.expiresAt) {
        throw new Error(data.error ?? "만료 기간을 연장하지 못했습니다.");
      }

      const newExpiresAt = data.expiresAt;
      const updated = savedLinks.map((link) =>
        link.slug === slug ? { ...link, expiresAt: newExpiresAt } : link,
      );
      setSavedLinks(updated);
      writeSavedLinks(updated);
      setSavedLinkStats((current) =>
        current[slug] ? { ...current, [slug]: { ...current[slug], expiresAt: newExpiresAt } } : current,
      );
      if (result?.slug === slug) {
        const nextResult = { ...result, expiresAt: newExpiresAt };
        setResult(nextResult);
        window.localStorage.setItem(LAST_RESULT_KEY, JSON.stringify(nextResult));
      }
      setExtendNotice(`만료가 ${formatDateTime(newExpiresAt)}(으)로 연장되었습니다.`);
      void loadMyLinks();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "만료 기간을 연장하지 못했습니다.";
      setExtendNotice(message);
    } finally {
      setIsExtending(false);
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
              src="/samlink-logo.svg?v=2"
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
              <span className="feature-brief-pill">QR 코드 PiP 모드 지원</span>
            </div>
          </aside>
        </section>

        <form className="stack create-form" onSubmit={handleSubmit}>
          <div className="form-intro">
            <span className="form-step">01</span>
            <div>
              <h2>링크 만들기</h2>
              <p>공유할 주소를 입력해 주세요.</p>
            </div>
          </div>
          <div className="label">
            <span>만들기 유형</span>
            <div className="retention-options" role="radiogroup" aria-label="만들기 유형 선택">
              <label className="retention-option">
                <input
                  type="radio"
                  name="createMode"
                  value="single"
                  checked={createMode === "single"}
                  onChange={() => setCreateMode("single")}
                />
                <span>일반 링크</span>
              </label>
              <label className="retention-option">
                <input
                  type="radio"
                  name="createMode"
                  value="bundle"
                  checked={createMode === "bundle"}
                  onChange={() => setCreateMode("bundle")}
                />
                <span>링크 묶음</span>
              </label>
            </div>
          </div>

          {createMode === "single" ? (
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
          ) : (
            <div className="label">
              <span>묶을 링크들</span>
              <p className="bundle-editor-hint">
                하나의 짧은 주소로 여러 링크를 함께 전달합니다. 학생은 버튼 목록에서 골라 이동해요.
              </p>
              <input
                className="field"
                type="text"
                value={bundleTitle}
                maxLength={60}
                placeholder="묶음 제목 (예: 월요일 3교시 과학)"
                onChange={(event) => setBundleTitle(event.target.value)}
              />
              <div className="bundle-editor-list">
                {bundleItems.map((item, index) => (
                  <div className="bundle-editor-row" key={index}>
                    <input
                      className="field bundle-editor-label"
                      type="text"
                      value={item.label}
                      maxLength={40}
                      placeholder={`이름 (예: 활동지 ${index + 1})`}
                      onChange={(event) =>
                        setBundleItems((current) =>
                          current.map((entry, entryIndex) =>
                            entryIndex === index ? { ...entry, label: event.target.value } : entry,
                          ),
                        )
                      }
                    />
                    <input
                      className="field bundle-editor-url"
                      type="url"
                      value={item.url}
                      required
                      placeholder="https://..."
                      onChange={(event) =>
                        setBundleItems((current) =>
                          current.map((entry, entryIndex) =>
                            entryIndex === index ? { ...entry, url: event.target.value } : entry,
                          ),
                        )
                      }
                    />
                    {bundleItems.length > 2 ? (
                      <button
                        className="mini-button danger bundle-editor-remove"
                        type="button"
                        aria-label={`${index + 1}번째 링크 제거`}
                        onClick={() =>
                          setBundleItems((current) =>
                            current.filter((_, entryIndex) => entryIndex !== index),
                          )
                        }
                      >
                        ✕
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
              {bundleItems.length < 8 ? (
                <button
                  className="mini-button bundle-editor-add"
                  type="button"
                  onClick={() =>
                    setBundleItems((current) => [...current, { label: "", url: "" }])
                  }
                >
                  ＋ 링크 추가 ({bundleItems.length}/8)
                </button>
              ) : null}
            </div>
          )}

          <label className="label">
            <span>원하는 주소 이름 (선택)</span>
            <div className="slug-input-row">
              <span className="slug-prefix">{BRAND_DOMAIN}/</span>
              <input
                className="field slug-input"
                type="text"
                value={customSlug}
                maxLength={30}
                placeholder="예: 3반과학 · 비우면 자동 생성"
                onChange={(event) => setCustomSlug(event.target.value)}
              />
            </div>
          </label>

          <div className="label">
            <span>유지 기간</span>
            <div className="retention-options" role="radiogroup" aria-label="유지 기간 선택">
              {(
                [
                  { value: "day", text: "1일" },
                  { value: "week", text: "1주일" },
                  { value: "month", text: "1개월" },
                  { value: "quarter", text: "3개월" },
                ] as const
              ).map((option) => (
                <label className="retention-option" key={option.value}>
                  <input
                    type="radio"
                    name="retentionPeriod"
                    value={option.value}
                    defaultChecked={option.value === "week"}
                    required
                  />
                  <span>{option.text}</span>
                </label>
              ))}
            </div>
          </div>

          <button className="submit" type="submit" disabled={isSubmitting}>
            {isSubmitting
              ? "만드는 중..."
              : createMode === "bundle"
                ? "링크 묶음 만들기"
                : "단축링크 만들기"}
          </button>
          <p className="form-hint">
            생성 형식: {BRAND_DOMAIN}/코드4자 · 한글 이름도 가능 (예: {BRAND_DOMAIN}/3반과학)
          </p>
        </form>

        {result ? (
          <section className="result-card" aria-live="polite">
            <div className="result-card-heading">
              <div>
                <span className="section-kicker">완료</span>
                <strong>새 단축링크가 준비됐어요</strong>
              </div>
              <span className="result-card-status">사용 가능</span>
            </div>
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
          </section>
        ) : null}

        {error ? <p className="error">{error}</p> : null}

        <section className="result-card" aria-label="내 링크">
          <div className="result-head">
            <strong>내 링크</strong>
            <span className="result-tip">이 브라우저에서 만든 링크입니다. 카드를 누르면 통계·QR·별명·만료 연장을 관리할 수 있어요.</span>
          </div>

          {mergedLinks.length ? (
            <div className="saved-links-list">
              {visibleLinks.map((link) => {
                const linkUrl = link.displayShortUrl ?? link.shortUrl;
                const statsForLink = savedLinkStats[link.slug];
                const effectiveExpiresAt = statsForLink?.expiresAt ?? link.expiresAt;
                const linkExpired = isExpired(effectiveExpiresAt);
                const isDead = link.isActive === false || linkExpired;
                const expiryBadge = isDead ? null : getExpiryBadge(effectiveExpiresAt);

                return (
                  <button
                    className="saved-link-item"
                    type="button"
                    key={link.slug}
                    disabled={isDead}
                    onClick={() => openMergedLink(link)}
                  >
                    <div className="saved-link-item-main">
                      {link.label ? <span className="saved-link-label">{link.label}</span> : null}
                      <strong>{linkUrl}</strong>
                      <span>{link.destination}</span>
                    </div>
                    <div className="saved-link-item-meta">
                      {isDead ? (
                        <span className="my-link-status">
                          {link.isActive === false ? "비활성" : "만료됨"}
                        </span>
                      ) : null}
                      {expiryBadge ? (
                        <span className={expiryBadge.urgent ? "expiry-badge urgent" : "expiry-badge"}>
                          ⏳ {expiryBadge.text}
                        </span>
                      ) : null}
                      <span>클릭 {statsForLink?.clickCount ?? 0}</span>
                      <span>최근 5분 {statsForLink?.recentVisitors ?? 0}</span>
                    </div>
                  </button>
                );
              })}
              {hiddenLinkCount > 0 || isMyLinksExpanded ? (
                <button
                  className="my-links-toggle"
                  type="button"
                  onClick={() => setIsMyLinksExpanded((current) => !current)}
                >
                  {isMyLinksExpanded ? "접기" : `더 보기 ${hiddenLinkCount}개`}
                </button>
              ) : null}
            </div>
          ) : isLoadingMyLinks ? (
            <p className="empty-result">불러오는 중...</p>
          ) : (
            <p className="empty-result">
              아직 만든 링크가 없습니다. 단축링크를 만들면 여기에 자동으로 보관됩니다.
            </p>
          )}
        </section>

        <p className="global-stats-line" aria-label="샘링크 통계">
          지금까지 <strong>{stats.createdCount.toLocaleString()}개</strong>의 단축 주소가 만들어졌고, 현재{" "}
          <strong>{stats.activeCount.toLocaleString()}개</strong>가 사용 중이에요.
        </p>

        <p className="warning-note">
          오용과 남용을 막기 위해 과도한 생성, 자동화된 요청, 비정상적인 사용은 제한될 수 있습니다.
        </p>

        <nav className="partner-links" aria-label="연결 사이트">
          <span className="partner-links-kicker">연결 사이트</span>
          <a href="https://끄적끄적아지트.site" target="_blank" rel="noreferrer">
            끄적끄적아지트 <span>초등 글쓰기 통합 플랫폼</span>
          </a>
          <a href="https://survival.xn--vz0ba242ncqcba79xhwx.site/" target="_blank" rel="noreferrer">
            문해력 서바이벌 <span>자리·역할배치 기반 문해력 활동</span>
          </a>
        </nav>
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
            <div className="saved-link-actions qr-modal-actions">
              <button
                className="mini-button"
                type="button"
                onClick={() => {
                  const saved = savedLinks.find((link) => link.slug === result?.slug);
                  openQrPrintView(resultUrl, saved?.label ?? "", result?.slug ?? "code");
                }}
                title="제목과 QR 코드, 짧은 주소가 함께 들어간 A4 인쇄용 화면을 엽니다."
              >
                🖨️ 인쇄
              </button>
              <button
                className="mini-button"
                type="button"
                onClick={() => {
                  if (result) window.open(`/present/${encodeURIComponent(result.slug)}`, "_blank");
                }}
                title="프로젝터·전자칠판용 전체화면으로 큰 QR과 주소, 실시간 입장 인원을 보여줍니다."
              >
                🎬 발표 모드
              </button>
              <button
                className="mini-button"
                type="button"
                onClick={() => {
                  if (result) handleSystemAlwaysOnTop(resultUrl, result.slug);
                  setIsQrOpen(false);
                }}
                title="PPT, 한글, 다른 웹사이트 등 어떤 화면을 열어도 항상 화면 가장 위에 떠 있습니다."
              >
                🖥️ 항상 위에 (AOT)
              </button>
              <button
                className="mini-button"
                type="button"
                onClick={() => {
                  if (result) handlePinQr(resultUrl, result.slug);
                  setIsQrOpen(false);
                }}
                title="현재 웹 브라우저 화면 안에서 자유롭게 크기와 위치를 조절하며 고정합니다."
              >
                📌 화면에 고정
              </button>
            </div>
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
            {isEditingLabel ? (
              <div className="label-edit-row">
                <input
                  className="field label-edit-input"
                  type="text"
                  value={labelDraft}
                  maxLength={40}
                  placeholder="예: 3반 수학 설문"
                  autoFocus
                  onChange={(event) => setLabelDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") saveLabel(selectedSavedLink.slug);
                    if (event.key === "Escape") setIsEditingLabel(false);
                  }}
                />
                <button className="mini-button" type="button" onClick={() => saveLabel(selectedSavedLink.slug)}>
                  저장
                </button>
                <button className="mini-button" type="button" onClick={() => setIsEditingLabel(false)}>
                  취소
                </button>
              </div>
            ) : (
              <div className="label-display-row">
                <strong className="saved-link-label-large">
                  {selectedSavedLink.label ?? "별명 없음"}
                </strong>
                <button
                  className="mini-button"
                  type="button"
                  onClick={() => {
                    setLabelDraft(selectedSavedLink.label ?? "");
                    setIsEditingLabel(true);
                  }}
                >
                  ✏️ {selectedSavedLink.label ? "별명 수정" : "별명 붙이기"}
                </button>
              </div>
            )}
            <a
              className="result-link saved-link-modal-url"
              href={selectedSavedLink.shortUrl}
              target="_blank"
              rel="noreferrer"
            >
              {selectedSavedUrl}
            </a>
            <p className="result-meta">원본 주소: {selectedSavedLink.destination}</p>
            <div className="expiry-row">
              <p className="result-meta">
                만료 예정: {formatDateTime(selectedSavedStats?.expiresAt ?? selectedSavedLink.expiresAt)}
                {(() => {
                  const badge = getExpiryBadge(selectedSavedStats?.expiresAt ?? selectedSavedLink.expiresAt);
                  return badge ? (
                    <span className={badge.urgent ? "expiry-badge urgent" : "expiry-badge"}> ⏳ {badge.text}</span>
                  ) : null;
                })()}
              </p>
              <button
                className="mini-button"
                type="button"
                disabled={isExtending}
                onClick={() => extendSavedLink(selectedSavedLink.slug)}
                title="만료를 지금 기준 최대 90일까지, 1개월씩 연장합니다."
              >
                {isExtending ? "연장 중..." : "⏰ 만료 1개월 연장"}
              </button>
            </div>
            {extendNotice ? <p className="extend-notice">{extendNotice}</p> : null}
            <p className="result-meta">저장한 시각: {formatDateTime(selectedSavedLink.savedAt)}</p>
            <hr className="modal-divider" />
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
                <button
                  className="mini-button"
                  type="button"
                  onClick={() =>
                    openQrPrintView(selectedSavedUrl, selectedSavedLink.label ?? "", selectedSavedLink.slug)
                  }
                  title="제목과 QR 코드, 짧은 주소가 함께 들어간 A4 인쇄용 화면을 엽니다."
                >
                  🖨️ 인쇄
                </button>
                <button
                  className="mini-button"
                  type="button"
                  onClick={() =>
                    window.open(`/present/${encodeURIComponent(selectedSavedLink.slug)}`, "_blank")
                  }
                  title="프로젝터·전자칠판용 전체화면으로 큰 QR과 주소, 실시간 입장 인원을 보여줍니다."
                >
                  🎬 발표 모드
                </button>
                <button
                  className="mini-button"
                  type="button"
                  onClick={() => {
                    handleSystemAlwaysOnTop(selectedSavedUrl, selectedSavedLink.slug);
                    setSelectedSavedSlug(null);
                  }}
                  title="PPT, 한글, 다른 프로그램 등 어떤 화면 위에든 항상 상단에 띄웁니다."
                >
                  🖥️ 항상 위에 (AOT)
                </button>
                <button
                  className="mini-button"
                  type="button"
                  onClick={() => {
                    handlePinQr(selectedSavedUrl, selectedSavedLink.slug);
                    setSelectedSavedSlug(null);
                  }}
                  title="현재 페이지 내에서 플로팅 박스로 고정합니다."
                >
                  📌 화면에 고정
                </button>
              </div>
            </div>
            <hr className="modal-divider" />
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
            <hr className="modal-divider" />
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

      {/* 📌 QR Code Floating Pin Mode Widget */}
      {pinnedQrUrl && (
        <div
          className={`floating-qr-container ${isDragging ? "dragging" : ""}`}
          style={{
            left: `${position.x}px`,
            top: `${position.y}px`,
          }}
          onMouseDown={handleMouseDown}
          onTouchStart={handleTouchStart}
        >
          <div className="drag-handle" title="드래그하여 이동">
            <div className="drag-indicator-group" aria-hidden="true">
              <span className="drag-dot"></span>
              <span className="drag-dot"></span>
              <span className="drag-dot"></span>
            </div>
            <span className="drag-title">📌 QR 고정 플로팅</span>
            <button
              className="drag-close-btn"
              onClick={() => {
                setPinnedQrUrl(null);
                setPinnedSlug(null);
              }}
              title="고정 해제"
              aria-label="고정 해제"
            >
              ✕
            </button>
          </div>
          <div className="floating-qr-body">
            <img
              src={`/api/qr?size=900&margin=10&data=${encodeURIComponent(pinnedQrUrl)}`}
              alt="화면에 고정된 QR 코드"
              className="floating-qr-img"
              draggable={false}
            />
            <div className="floating-qr-footer">
              <a
                href={pinnedQrUrl}
                target="_blank"
                rel="noreferrer"
                className="floating-qr-link"
                title={pinnedQrUrl}
              >
                {pinnedQrUrl.replace(/^https?:\/\//, "")}
              </a>
              {pinnedRecentVisitors !== null ? (
                <span className="floating-qr-count" aria-live="polite">
                  👥 최근 5분 {pinnedRecentVisitors}명 접속
                </span>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
