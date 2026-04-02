"use client";

import type { Session } from "@supabase/supabase-js";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

type AdminLink = {
  id: number;
  slug: string;
  destination: string;
  created_by: string | null;
  expires_at: string | null;
  click_count: number;
  is_active: boolean;
  created_at: string;
};

type LinksResponse = {
  links?: AdminLink[];
  deletedCount?: number;
  error?: string;
};

const supabase = createBrowserSupabaseClient();
const SITE_LABEL = "샘링크.kr";

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
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [links, setLinks] = useState<AdminLink[]>([]);
  const [deletedCount, setDeletedCount] = useState(0);
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [isBooting, setIsBooting] = useState(true);
  const [isLoadingLinks, setIsLoadingLinks] = useState(false);
  const [busyIds, setBusyIds] = useState<number[]>([]);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [authError, setAuthError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let mounted = true;

    async function loadSession() {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setSession(data.session);
      setIsBooting(false);
    }

    void loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setIsBooting(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session?.access_token) {
      setLinks([]);
      setSelectedIds([]);
      setDeletedCount(0);
      return;
    }

    void loadLinks(session.access_token);
  }, [session]);

  async function loadLinks(token: string) {
    setIsLoadingLinks(true);
    setAuthError("");

    try {
      const response = await fetch("/api/admin/links", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = (await response.json()) as LinksResponse;
      if (!response.ok) {
        throw new Error(data.error ?? "링크 목록을 불러오지 못했습니다.");
      }

      setLinks(data.links ?? []);
      setDeletedCount(data.deletedCount ?? 0);
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

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setAuthError(error.message);
      return;
    }

    setMessage("로그인했습니다.");
    setPassword("");
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    setMessage("로그아웃했습니다.");
  }

  function setBusy(id: number, active: boolean) {
    setBusyIds((current) =>
      active ? Array.from(new Set([...current, id])) : current.filter((value) => value !== id),
    );
  }

  async function mutateLink(id: number, action: "toggle" | "delete") {
    if (!session?.access_token) return;

    setBusy(id, true);
    setMessage("");
    setAuthError("");

    try {
      const response =
        action === "delete"
          ? await fetch(`/api/admin/links/${id}`, {
              method: "DELETE",
              headers: {
                Authorization: `Bearer ${session.access_token}`,
              },
            })
          : await fetch(`/api/admin/links/${id}`, {
              method: "PATCH",
              headers: {
                Authorization: `Bearer ${session.access_token}`,
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
      await loadLinks(session.access_token);
    } catch (caught) {
      const text = caught instanceof Error ? caught.message : "작업을 완료하지 못했습니다.";
      setAuthError(text);
    } finally {
      setBusy(id, false);
    }
  }

  async function bulkDelete() {
    if (!session?.access_token || selectedIds.length === 0) return;

    const confirmed = window.confirm(`선택한 ${selectedIds.length}개 링크를 삭제할까요?`);
    if (!confirmed) return;

    setAuthError("");
    setMessage("");

    try {
      const response = await fetch("/api/admin/links/bulk-delete", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ids: selectedIds }),
      });

      const data = (await response.json()) as { error?: string; deleted?: number };
      if (!response.ok) {
        throw new Error(data.error ?? "선택한 링크를 삭제하지 못했습니다.");
      }

      setMessage(`선택한 링크 ${data.deleted ?? 0}개를 삭제했습니다.`);
      await loadLinks(session.access_token);
    } catch (caught) {
      const text = caught instanceof Error ? caught.message : "선택한 링크를 삭제하지 못했습니다.";
      setAuthError(text);
    }
  }

  async function cleanupExpired() {
    setMessage("");
    setAuthError("");

    try {
      const response = await fetch("/api/cleanup-expired", { method: "POST" });
      const data = (await response.json()) as { error?: string; deleted?: number };
      if (!response.ok) {
        throw new Error(data.error ?? "만료 링크 정리에 실패했습니다.");
      }

      setMessage(`만료 링크 ${data.deleted ?? 0}개를 정리했습니다.`);
      if (session?.access_token) {
        await loadLinks(session.access_token);
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
            <p className="lead">{session.user.email}로 로그인되었습니다.</p>
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

        <div className="admin-summary">
          <div className="summary-card">
            <strong>{links.length}</strong>
            <span>전체</span>
          </div>
          <div className="summary-card">
            <strong>{activeCount}</strong>
            <span>활성</span>
          </div>
          <div className="summary-card">
            <strong>{expiringCount}</strong>
            <span>만료 예정</span>
          </div>
          <div className="summary-card">
            <strong>{expiredCount}</strong>
            <span>만료됨</span>
          </div>
          <div className="summary-card">
            <strong>{selectedIds.length}</strong>
            <span>선택됨</span>
          </div>
        </div>

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
                <th>상태</th>
                <th>작업</th>
              </tr>
            </thead>
            <tbody>
              {isLoadingLinks ? (
                <tr>
                  <td colSpan={8}>불러오는 중...</td>
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
                  <td colSpan={8}>표시할 링크가 없습니다.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="admin-footer-banner">
          <div className="banner-card">
            <span className="banner-label">현재 생성된 주소</span>
            <strong>{links.length}</strong>
          </div>
          <div className="banner-card">
            <span className="banner-label">현재 이용자 수</span>
            <strong>{liveCount}</strong>
            <span className="banner-subtext">활성 링크 기준</span>
          </div>
          <div className="banner-card">
            <span className="banner-label">자동 삭제됨</span>
            <strong>{deletedCount}</strong>
            <span className="banner-subtext">누적 삭제 수</span>
          </div>
          <div className="banner-note">
            만료된 링크는 접속 또는 정리 작업에서 자동으로 삭제되고, 삭제 수는 누적됩니다.
          </div>
        </div>
      </section>
    </main>
  );
}
