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
  error?: string;
};

const supabase = createBrowserSupabaseClient();
const BRAND_DOMAIN = "쌤링크.kr";

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
  if (!expiresAt) return "-";
  const end = new Date(expiresAt).getTime();
  if (Number.isNaN(end)) return "-";

  const diff = end - Date.now();
  if (diff <= 0) return "만료됨";

  const totalHours = Math.ceil(diff / (60 * 60 * 1000));
  if (totalHours < 24) return `남은 시간 ${totalHours}시간`;

  const days = Math.ceil(totalHours / 24);
  return `남은 기간 ${days}일`;
}

function statusLabel(link: AdminLink) {
  if (!link.is_active) return "비활성";
  const expiresAt = link.expires_at ? new Date(link.expires_at).getTime() : null;
  if (expiresAt !== null && expiresAt <= Date.now()) return "만료";
  return "활성";
}

function statusClass(link: AdminLink) {
  const label = statusLabel(link);
  if (label === "활성") return "active";
  if (label === "비활성") return "inactive";
  return "expired";
}

export default function AdminPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [links, setLinks] = useState<AdminLink[]>([]);
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [isBooting, setIsBooting] = useState(true);
  const [isLoadingLinks, setIsLoadingLinks] = useState(false);
  const [busyIds, setBusyIds] = useState<number[]>([]);
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
        throw new Error(data.error ?? "목록을 불러오지 못했습니다.");
      }

      setLinks(data.links ?? []);
      setSelectedIds([]);
    } catch (caught) {
      const text =
        caught instanceof Error ? caught.message : "목록을 불러오지 못했습니다.";
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

    setMessage("로그인되었습니다.");
    setPassword("");
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    setMessage("로그아웃되었습니다.");
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
      const text =
        caught instanceof Error ? caught.message : "선택한 링크를 삭제하지 못했습니다.";
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
      const text =
        caught instanceof Error ? caught.message : "만료 링크 정리에 실패했습니다.";
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

  function toggleSelectAll() {
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

  if (isBooting) {
    return (
      <main className="admin-shell">
        <section className="admin-card">
          <p className="eyebrow">관리자</p>
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
            <h1>쌤링크 관리자</h1>
            <p className="lead">Supabase Auth로 로그인한 뒤 생성 이력과 상태를 관리합니다.</p>
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

  const activeCount = links.filter((link) => link.is_active).length;

  return (
    <main className="admin-shell">
      <section className="admin-card">
        <div className="admin-header">
          <div>
            <p className="eyebrow">쌤링크 관리자</p>
            <h1>생성 이력 관리</h1>
            <p className="lead">{session.user.email} 로 로그인되었습니다.</p>
          </div>

          <div className="admin-actions">
            <button className="ghost-button" type="button" onClick={cleanupExpired}>
              만료 링크 정리
            </button>
            <button
              className="ghost-button"
              type="button"
              onClick={bulkDelete}
              disabled={selectedIds.length === 0}
            >
              선택 삭제 {selectedIds.length ? `(${selectedIds.length})` : ""}
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
            <strong>{links.length - activeCount}</strong>
            <span>비활성/만료</span>
          </div>
        </div>

        <div className="admin-toolbar">
          <input
            className="field"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="slug, 원본 주소, 만든 사람 검색"
          />
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
                filteredLinks.map((link) => (
                  <tr key={link.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(link.id)}
                        onChange={() => toggleSelected(link.id)}
                      />
                    </td>
                    <td>
                      <div className="table-url">{`${BRAND_DOMAIN}/${link.slug}`}</div>
                      <div className="table-sub">{link.created_by ?? "-"}</div>
                    </td>
                    <td className="table-destination">{link.destination}</td>
                    <td>{formatDateTime(link.expires_at)}</td>
                    <td>{getRemainingLabel(link.expires_at)}</td>
                    <td>{link.click_count}</td>
                    <td>
                      <span className={`status-pill ${statusClass(link)}`}>
                        {statusLabel(link)}
                      </span>
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
                ))
              ) : (
                <tr>
                  <td colSpan={8}>표시할 링크가 없습니다.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
