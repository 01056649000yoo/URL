"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type AdminLink = {
  id: number;
  slug: string;
  destination: string;
  created_by: string | null;
  expires_at: string | null;
  click_count: number;
  recent_visitors_5m?: number;
  today_visitors?: number;
  is_active: boolean;
  created_at: string;
};

type LinksResponse = {
  links?: AdminLink[];
  createdCount?: number;
  todayCreated?: number;
  todayDeleted?: number;
  weekCreated?: number;
  monthCreated?: number;
  deletedCount?: number;
  recentVisitors?: number;
  todayVisitors?: number;
  todayPageVisitors?: number;
  alerts?: AdminAlert[];
  error?: string;
};

type AdminAlert = {
  alert_key: string;
  kind: string;
  title: string;
  message: string;
  created_at: string;
};

const SITE_LABEL = "샘링크.kr";
const ADMIN_SESSION_KEY = "samlink-admin-session";

type AdminSession = {
  email: string;
};

function formatDateTime(value?: string | null) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function getRemainingLabel(expiresAt?: string | null) {
  if (!expiresAt) return "무기한";

  const expiresAtMs = new Date(expiresAt).getTime();
  if (Number.isNaN(expiresAtMs)) return "-";

  const diffMs = expiresAtMs - Date.now();
  if (diffMs <= 0) return "만료됨";

  const totalMinutes = Math.ceil(diffMs / (60 * 1000));
  if (totalMinutes < 60) {
    return `남은 시간 ${Math.max(totalMinutes, 1)}분`;
  }

  const totalHours = Math.ceil(totalMinutes / 60);
  if (totalHours < 24) {
    return `남은 시간 ${totalHours}시간`;
  }

  const days = Math.ceil(totalHours / 24);
  return `남은 기간 ${days}일`;
}

function getStatus(link: AdminLink) {
  if (!link.is_active) {
    return { label: "비활성", className: "inactive" };
  }

  if (!link.expires_at) {
    return { label: "무기한", className: "active" };
  }

  const expiresAtMs = new Date(link.expires_at).getTime();
  if (Number.isNaN(expiresAtMs)) {
    return { label: "무기한", className: "active" };
  }

  if (expiresAtMs <= Date.now()) {
    return { label: "만료됨", className: "expired" };
  }

  return { label: "만료 예정", className: "pending" };
}

export default function AdminPage() {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [links, setLinks] = useState<AdminLink[]>([]);
  const [createdCount, setCreatedCount] = useState(0);
  const [todayCreated, setTodayCreated] = useState(0);
  const [todayDeleted, setTodayDeleted] = useState(0);
  const [deletedCount, setDeletedCount] = useState(0);
  const [recentVisitors, setRecentVisitors] = useState(0);
  const [todayVisitors, setTodayVisitors] = useState(0);
  const [todayPageVisitors, setTodayPageVisitors] = useState(0);
  const [weekCreated, setWeekCreated] = useState(0);
  const [monthCreated, setMonthCreated] = useState(0);
  const [alerts, setAlerts] = useState<AdminAlert[]>([]);
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [isBooting, setIsBooting] = useState(true);
  const [isLoadingLinks, setIsLoadingLinks] = useState(false);
  const [busyIds, setBusyIds] = useState<number[]>([]);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [authError, setAuthError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(ADMIN_SESSION_KEY);
      if (!raw) {
        setIsBooting(false);
        return;
      }

      const parsed = JSON.parse(raw) as AdminSession;
      if (!parsed?.email) {
        window.localStorage.removeItem(ADMIN_SESSION_KEY);
        setIsBooting(false);
        return;
      }

      setSession(parsed);
    } catch {
      window.localStorage.removeItem(ADMIN_SESSION_KEY);
    } finally {
      setIsBooting(false);
    }
  }, []);

  useEffect(() => {
    if (!session?.email) {
      setLinks([]);
      setCreatedCount(0);
      setTodayCreated(0);
      setTodayDeleted(0);
      setSelectedIds([]);
      setDeletedCount(0);
      setRecentVisitors(0);
      setTodayVisitors(0);
      setTodayPageVisitors(0);
      setWeekCreated(0);
      setMonthCreated(0);
      setAlerts([]);
      return;
    }

    void loadLinks();
  }, [session]);

  useEffect(() => {
    if (!session?.email) return;

    const timer = window.setInterval(() => {
      void loadLinks();
    }, 30000);

    return () => window.clearInterval(timer);
  }, [session]);

  async function loadLinks() {
    setIsLoadingLinks(true);
    setAuthError("");

    try {
      const response = await fetch("/api/admin/links");

      const data = (await response.json()) as LinksResponse;
      if (!response.ok) {
        if (response.status === 401) {
          setSession(null);
          window.localStorage.removeItem(ADMIN_SESSION_KEY);
        }
        throw new Error(data.error ?? "링크 목록을 불러오지 못했습니다.");
      }

      setLinks(data.links ?? []);
      setCreatedCount(data.createdCount ?? 0);
      setTodayCreated(data.todayCreated ?? 0);
      setTodayDeleted(data.todayDeleted ?? 0);
      setDeletedCount(data.deletedCount ?? 0);
      setRecentVisitors(data.recentVisitors ?? 0);
      setTodayVisitors(data.todayVisitors ?? 0);
      setTodayPageVisitors(data.todayPageVisitors ?? 0);
      setWeekCreated(data.weekCreated ?? 0);
      setMonthCreated(data.monthCreated ?? 0);
      setAlerts(data.alerts ?? []);
      setSelectedIds([]);
    } catch (caught) {
      const text = caught instanceof Error ? caught.message : "링크 목록을 불러오지 못했습니다.";
      setAuthError(text);
    } finally {
      setIsLoadingLinks(false);
    }
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthError("");
    setMessage("");

    const response = await fetch("/api/admin/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    });

    const data = (await response.json()) as { error?: string; email?: string };
    if (!response.ok || !data.email) {
      setAuthError(data.error ?? "로그인에 실패했습니다.");
      return;
    }

    const nextSession = {
      email: data.email,
    };
    setSession(nextSession);
    window.localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(nextSession));
    setMessage("로그인했습니다.");
    setPassword("");
  }

  async function handleLogout() {
    await fetch("/api/admin/logout", { method: "POST" }).catch(() => undefined);
    setSession(null);
    window.localStorage.removeItem(ADMIN_SESSION_KEY);
    setMessage("로그아웃했습니다.");
  }

  function setBusy(id: number, active: boolean) {
    setBusyIds((current) =>
      active ? Array.from(new Set([...current, id])) : current.filter((value) => value !== id),
    );
  }

  async function mutateLink(id: number, action: "toggle" | "delete") {
    if (!session?.email) return;

    setBusy(id, true);
    setMessage("");
    setAuthError("");

    try {
      const response =
        action === "delete"
          ? await fetch(`/api/admin/links/${id}`, {
              method: "DELETE",
            })
          : await fetch(`/api/admin/links/${id}`, {
              method: "PATCH",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                isActive: !links.find((link) => link.id === id)?.is_active,
              }),
            });

      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "작업을 완료하지 못했습니다.");
      }

      setMessage(action === "delete" ? "링크를 삭제했습니다." : "링크 상태를 변경했습니다.");
      await loadLinks();
    } catch (caught) {
      const text = caught instanceof Error ? caught.message : "작업을 완료하지 못했습니다.";
      setAuthError(text);
    } finally {
      setBusy(id, false);
    }
  }

  async function bulkDelete() {
    if (!session?.email || selectedIds.length === 0) return;

    const confirmed = window.confirm(`선택한 ${selectedIds.length}개 링크를 삭제할까요?`);
    if (!confirmed) return;

    setAuthError("");
    setMessage("");

    try {
      const response = await fetch("/api/admin/links/bulk-delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ids: selectedIds }),
      });

      const data = (await response.json()) as { error?: string; deleted?: number };
      if (!response.ok) {
        throw new Error(data.error ?? "선택한 링크를 삭제하지 못했습니다.");
      }

      setMessage(`선택한 링크 ${data.deleted ?? 0}개를 삭제했습니다.`);
      await loadLinks();
    } catch (caught) {
      const text = caught instanceof Error ? caught.message : "선택한 링크를 삭제하지 못했습니다.";
      setAuthError(text);
    }
  }

  async function cleanupExpired() {
    setMessage("");
    setAuthError("");

    try {
      const response = await fetch("/api/cleanup-expired", {
        method: "POST",
      });
      const data = (await response.json()) as { error?: string; deleted?: number };
      if (!response.ok) {
        throw new Error(data.error ?? "만료 링크 정리에 실패했습니다.");
      }

      setMessage(`만료 링크 ${data.deleted ?? 0}개를 정리했습니다.`);
      if (session?.email) {
        await loadLinks();
      }
    } catch (caught) {
      const text = caught instanceof Error ? caught.message : "만료 링크 정리에 실패했습니다.";
      setAuthError(text);
    }
  }

  const filteredLinks = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return links;

    return links.filter((link) =>
      [link.slug, link.destination, link.created_by ?? ""].some((value) =>
        value.toLowerCase().includes(term),
      ),
    );
  }, [links, query]);

  const allVisibleSelected =
    filteredLinks.length > 0 && filteredLinks.every((link) => selectedIds.includes(link.id));

  const selectedVisibleCount = filteredLinks.filter((link) => selectedIds.includes(link.id)).length;
  const activeCount = links.filter((link) => link.is_active).length;
  const expiringCount = links.filter((link) => {
    if (!link.expires_at) return false;
    const expiresAtMs = new Date(link.expires_at).getTime();
    return Number.isFinite(expiresAtMs) && expiresAtMs > Date.now();
  }).length;
  const expiredCount = links.filter((link) => {
    if (!link.expires_at) return false;
    const expiresAtMs = new Date(link.expires_at).getTime();
    return Number.isFinite(expiresAtMs) && expiresAtMs <= Date.now();
  }).length;
  const liveCount = links.filter((link) => {
    if (!link.is_active) return false;
    if (!link.expires_at) return true;

    const expiresAtMs = new Date(link.expires_at).getTime();
    return Number.isFinite(expiresAtMs) && expiresAtMs > Date.now();
  }).length;

  function toggleSelectAll() {
    if (!filteredLinks.length) return;

    if (allVisibleSelected) {
      setSelectedIds((current) =>
        current.filter((id) => !filteredLinks.some((link) => link.id === id)),
      );
      return;
    }

    setSelectedIds((current) =>
      Array.from(new Set([...current, ...filteredLinks.map((link) => link.id)])),
    );
  }

  function toggleSelected(id: number) {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  }

  async function copyShortUrl(link: AdminLink) {
    const shortUrl = `${SITE_LABEL}/${link.slug}`;
    try {
      await navigator.clipboard.writeText(shortUrl);
      setCopiedId(link.id);
      window.setTimeout(() => setCopiedId((current) => (current === link.id ? null : current)), 1400);
    } catch {
      setMessage("짧은 주소 복사에 실패했습니다.");
    }
  }

  if (isBooting) {
    return (
      <main className="admin-shell">
        <section className="admin-card">
          <p className="eyebrow">샘링크 관리자</p>
          <h1>불러오는 중...</h1>
        </section>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="admin-shell">
        <section className="admin-card admin-login">
          <div>
            <p className="eyebrow">관리자 로그인</p>
            <h1>샘링크 관리자</h1>
            <p className="lead">
              Supabase Auth로 로그인한 뒤 생성 이력과 상태를 한 번에 관리할 수 있습니다.
            </p>
          </div>

          <form className="stack" onSubmit={handleLogin}>
            <label className="label">
              <span>관리자 이메일</span>
              <input
                className="field"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="admin@example.com"
                required
              />
            </label>

            <label className="label">
              <span>비밀번호</span>
              <input
                className="field"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Supabase Auth 비밀번호"
                required
              />
            </label>

            <button className="submit" type="submit">
              로그인
            </button>
          </form>

          {authError ? <p className="error">{authError}</p> : null}
          {message ? <p className="admin-note">{message}</p> : null}
        </section>
      </main>
    );
  }

  return (
    <main className="admin-shell">
      <section className="admin-card">
        <div className="admin-header">
          <div>
            <p className="eyebrow">샘링크 관리자</p>
            <h1>생성 이력 관리</h1>
            <p className="lead">{session.email}로 로그인되었습니다.</p>
          </div>

          <div className="admin-toolbar-actions">
            <button className="ghost-button" type="button" onClick={toggleSelectAll}>
              {allVisibleSelected ? "전체 해제" : "전체 선택"}
            </button>
            <button
              className="ghost-button danger-outline"
              type="button"
              onClick={bulkDelete}
              disabled={selectedIds.length === 0}
            >
              삭제
            </button>
            <button className="ghost-button" type="button" onClick={cleanupExpired}>
              만료 링크 정리
            </button>
            <button className="ghost-button" type="button" onClick={handleLogout}>
              로그아웃
            </button>
          </div>
        </div>

        <div className="admin-stats-banner">
          <div className="banner-card">
            <span className="banner-label">전체</span>
            <strong>{links.length}</strong>
            <span className="banner-subtext">현재 DB 보관 건수</span>
          </div>
          <div className="banner-card">
            <span className="banner-label">활성 링크 수</span>
            <strong>{liveCount}</strong>
            <span className="banner-subtext">활성 + 미만료</span>
          </div>
          <div className="banner-card">
            <span className="banner-label">누적 생성 주소</span>
            <strong>{createdCount}</strong>
            <span className="banner-subtext">삭제된 주소까지 포함</span>
          </div>
          <div className="banner-card">
            <span className="banner-label">오늘 생성</span>
            <strong>{todayCreated}</strong>
            <span className="banner-subtext">오늘 기준</span>
          </div>
          <div className="banner-card">
            <span className="banner-label">최근 7일 생성</span>
            <strong>{weekCreated}</strong>
            <span className="banner-subtext">오늘 포함 7일</span>
          </div>
          <div className="banner-card">
            <span className="banner-label">최근 30일 생성</span>
            <strong>{monthCreated}</strong>
            <span className="banner-subtext">오늘 포함 30일</span>
          </div>
          <div className="banner-card">
            <span className="banner-label">오늘 페이지 접속자</span>
            <strong>{todayPageVisitors}</strong>
            <span className="banner-subtext">메인 페이지 유니크 방문</span>
          </div>
          <div className="banner-card">
            <span className="banner-label">오늘 링크 방문자</span>
            <strong>{todayVisitors}</strong>
            <span className="banner-subtext">단축링크 리다이렉트</span>
          </div>
          <div className="banner-card">
            <span className="banner-label">최근 5분 접속</span>
            <strong>{recentVisitors}</strong>
            <span className="banner-subtext">실시간 추정</span>
          </div>
          <div className="banner-card">
            <span className="banner-label">만료 예정</span>
            <strong>{expiringCount}</strong>
            <span className="banner-subtext">아직 유효</span>
          </div>
          <div className="banner-card">
            <span className="banner-label">만료됨</span>
            <strong>{expiredCount}</strong>
            <span className="banner-subtext">정리 대상</span>
          </div>
          <div className="banner-card">
            <span className="banner-label">오늘 삭제</span>
            <strong>{todayDeleted}</strong>
            <span className="banner-subtext">오늘 기준</span>
          </div>
          <div className="banner-card">
            <span className="banner-label">자동 삭제됨</span>
            <strong>{deletedCount}</strong>
            <span className="banner-subtext">누적 삭제 수</span>
          </div>
          <div className="banner-card">
            <span className="banner-label">선택됨</span>
            <strong>{selectedIds.length}</strong>
            <span className="banner-subtext">현재 체크된 행</span>
          </div>
          <div className="banner-note">
            페이지 접속자는 메인 페이지 방문자 수, 링크 방문자는 단축링크 클릭 리다이렉트 기준이며, 모두 유니크 방문자 기준입니다. 30초마다 자동 갱신됩니다.
          </div>
        </div>

        {alerts.length ? (
          <div className="admin-alert-banner">
            <div className="admin-alert-header">
              <strong>요청 관찰 알림</strong>
              <span>최근 생성량이 평소보다 많습니다</span>
            </div>
            <div className="admin-alert-list">
              {alerts.map((alert) => (
                <div className="admin-alert-item" key={alert.alert_key}>
                  <strong>{alert.title}</strong>
                  <p>{alert.message}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="admin-toolbar">
          <input
            className="field"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="slug, 원본 주소, 만든 사람 검색"
          />
          <div className="admin-toolbar-meta">
            <span className="result-meta">표시 중 {filteredLinks.length}개</span>
            <span className="result-meta">선택됨 {selectedVisibleCount}개</span>
          </div>
        </div>

        {authError ? <p className="error">{authError}</p> : null}
        {message ? <p className="admin-note">{message}</p> : null}

        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>
                  <label className="table-check">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={toggleSelectAll}
                    />
                    <span>선택</span>
                  </label>
                </th>
                <th>짧은 주소</th>
                <th>원본 주소</th>
                <th>만료일</th>
                <th>남은 기간</th>
                <th>클릭</th>
                <th>최근 5분</th>
                <th>오늘 방문</th>
                <th>상태</th>
                <th>작업</th>
              </tr>
            </thead>
            <tbody>
              {isLoadingLinks ? (
                <tr>
                  <td colSpan={10}>불러오는 중...</td>
                </tr>
              ) : filteredLinks.length ? (
                filteredLinks.map((link) => {
                  const status = getStatus(link);
                  const rowSelected = selectedIds.includes(link.id);
                  const shortUrl = `${SITE_LABEL}/${link.slug}`;
                  const copied = copiedId === link.id;

                  return (
                    <tr key={link.id} className={rowSelected ? "table-row-selected" : undefined}>
                      <td>
                        <input
                          type="checkbox"
                          checked={rowSelected}
                          onChange={() => toggleSelected(link.id)}
                        />
                      </td>
                      <td>
                        <div className="table-url">{shortUrl}</div>
                        <div className="table-sub">{link.created_by ?? "-"}</div>
                        <button
                          className="mini-button copy-inline-button"
                          type="button"
                          onClick={() => copyShortUrl(link)}
                        >
                          {copied ? "복사됨" : "복사"}
                        </button>
                      </td>
                      <td className="table-destination">{link.destination}</td>
                      <td>{formatDateTime(link.expires_at)}</td>
                      <td>{getRemainingLabel(link.expires_at)}</td>
                      <td>{link.click_count}</td>
                      <td>{link.recent_visitors_5m ?? 0}</td>
                      <td>{link.today_visitors ?? 0}</td>
                      <td>
                        <span className={`status-pill ${status.className}`}>{status.label}</span>
                      </td>
                      <td>
                        <div className="row-actions">
                          <button
                            className="mini-button"
                            type="button"
                            disabled={busyIds.includes(link.id)}
                            onClick={() => mutateLink(link.id, "toggle")}
                          >
                            {link.is_active ? "비활성화" : "복원"}
                          </button>
                          <button
                            className="mini-button danger"
                            type="button"
                            disabled={busyIds.includes(link.id)}
                            onClick={() => mutateLink(link.id, "delete")}
                          >
                            삭제
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={10}>표시할 링크가 없습니다.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

      </section>
    </main>
  );
}
