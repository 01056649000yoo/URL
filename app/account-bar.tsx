"use client";

import { useEffect, useRef, useState } from "react";

// 아지트 선생님 계정 연결 표시줄(2026-10-05).
// - 아지트 안(iframe, ?embed=agit): 연결 안 돼 있으면 부모(아지트)에 연결표를 달라고 해서 저절로 연결한다.
// - 쌤링크.kr 직접: "아지트 계정으로 연결" → 아지트가 연결표를 만들어 /connect#ticket= 으로 돌려보낸다.
// 연결표는 1분·한 번만 쓰는 값이라 아지트 로그인 토큰이 쌤링크로 넘어오지 않는다.
export const AGIT_ORIGIN = "https://xn--vz0ba242ncqcba79xhwx.site";
const AGIT_CONNECT_URL = `${AGIT_ORIGIN}/?samlink-connect=1`;

type AccountState = { connected: boolean; displayName?: string };

export async function connectWithTicket(ticket: string) {
  const response = await fetch("/api/account/connect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ticket }),
  });
  const data = (await response.json().catch(() => ({}))) as { error?: string; displayName?: string; moved?: number };
  if (!response.ok) throw new Error(data.error || "연결하지 못했습니다.");
  return data;
}

export function AccountBar({ isEmbedded, onChanged, onStatus }: { isEmbedded: boolean; onChanged: () => void; onStatus?: (connected: boolean) => void }) {
  const [account, setAccount] = useState<AccountState | null>(null);
  const [notice, setNotice] = useState("");
  const askedParent = useRef(false);
  // 부모 화면이 다시 그려질 때마다 함수가 바뀌어도 연결 대기(메시지 리스너)가 풀리지 않게 ref 로 든다.
  const onChangedRef = useRef(onChanged);
  useEffect(() => { onChangedRef.current = onChanged; }, [onChanged]);
  const onStatusRef = useRef(onStatus);
  useEffect(() => { onStatusRef.current = onStatus; }, [onStatus]);
  // 목록 안내 문구(이 브라우저에만 / 계정에)를 바꿀 수 있게 연결 상태를 알려 준다.
  useEffect(() => { if (account) onStatusRef.current?.(account.connected); }, [account]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/account")
      .then((response) => response.json())
      .then((data: AccountState) => { if (!cancelled) setAccount(data); })
      .catch(() => { if (!cancelled) setAccount({ connected: false }); });
    return () => { cancelled = true; };
  }, []);

  // 아지트 안에서는 부모에게 연결표를 받아 저절로 연결한다(선생님 계정일 때만 부모가 답한다).
  useEffect(() => {
    if (!isEmbedded || !account || account.connected || askedParent.current) return;
    askedParent.current = true;

    const onMessage = async (event: MessageEvent) => {
      if (event.origin !== AGIT_ORIGIN || event.source !== window.parent) return;
      const data = event.data as { type?: string; ticket?: string };
      if (data?.type !== "samlink:ticket" || typeof data.ticket !== "string") return;
      window.removeEventListener("message", onMessage);
      try {
        const result = await connectWithTicket(data.ticket);
        setAccount({ connected: true, displayName: result.displayName });
        onChangedRef.current();
      } catch {
        // 아지트 안 자동 연결이 안 돼도 기기 목록으로 그대로 쓴다.
      }
    };
    window.addEventListener("message", onMessage);
    window.parent.postMessage({ type: "samlink:request-ticket" }, AGIT_ORIGIN);
    return () => window.removeEventListener("message", onMessage);
  }, [account, isEmbedded]);

  async function disconnect() {
    await fetch("/api/account/disconnect", { method: "POST" }).catch(() => {});
    setAccount({ connected: false });
    setNotice("이 브라우저에서 연결을 끊었습니다. 계정에 담긴 링크는 다시 연결하면 보입니다.");
    onChanged();
  }

  if (!account) return null;

  if (account.connected) {
    return (
      <div className="account-bar is-connected" role="status">
        <span className="account-bar-icon" aria-hidden="true">✅</span>
        <span className="account-bar-text">
          <strong>아지트 {account.displayName} 계정에 저장 중</strong>
          <small>다른 컴퓨터에서도 아지트 계정으로 연결하면 같은 링크 목록이 그대로 보여요.</small>
        </span>
        {!isEmbedded ? (
          <button type="button" className="account-bar-action is-quiet" onClick={disconnect}>연결 해제</button>
        ) : null}
      </div>
    );
  }

  // 아지트 안에서 연결이 안 된 경우(학생 계정 등)는 아무것도 보이지 않는다.
  if (isEmbedded) return null;

  return (
    <div className="account-bar">
      <span className="account-bar-icon" aria-hidden="true">✏️</span>
      <span className="account-bar-text">
        <strong>지금은 내 링크가 이 브라우저에만 저장돼요</strong>
        <small>{notice || "다른 컴퓨터나 브라우저에서는 보이지 않고, 쿠키를 지우면 사라져요. 끄적끄적아지트 선생님 계정으로 연결하면 어디서든 내 링크가 그대로 보여요."}</small>
      </span>
      <a className="account-bar-action" href={AGIT_CONNECT_URL}>아지트 계정으로 연결</a>
    </div>
  );
}
