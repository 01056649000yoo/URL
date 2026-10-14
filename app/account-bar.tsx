"use client";

import { useEffect, useRef, useState } from "react";

// 아지트 선생님 계정 연결 표시줄(2026-10-05).
// - 아지트 안(iframe, ?embed=agit): 연결 안 돼 있으면 부모(아지트)에 연결표를 달라고 해서 저절로 연결한다.
// - 쌤링크.kr 직접: "아지트 계정으로 연결" → 아지트가 연결표를 만들어 /connect#ticket= 으로 돌려보낸다.
// 연결표는 1분·한 번만 쓰는 값이라 아지트 로그인 토큰이 쌤링크로 넘어오지 않는다.
export const AGIT_ORIGIN = "https://xn--vz0ba242ncqcba79xhwx.site";
const AGIT_CONNECT_URL = `${AGIT_ORIGIN}/?samlink-connect=1`;
const RESTART_PARAM = "samlink-restart";

type AccountState = { connected: boolean; displayName?: string };

type ConnectResult = { error?: string; displayName?: string; moved?: number };

async function postConnect(path: string, body: Record<string, string>) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await response.json().catch(() => ({}))) as ConnectResult;
  if (!response.ok) throw new Error(data.error || "연결하지 못했습니다.");
  return data;
}

// 샘링크.kr 에서 직접 누른 연결: state 가 꼭 있어야 한다. state 가 없으면 서버로 보내지 않고 멈춘다
// (2026-10-14 점검: 예전에는 state 가 없으면 state 를 안 보는 아지트 안 연결 길로 넘어가, 남이 만든 `/connect#ticket=…` 주소로 연결이 바뀔 수 있었다).
export async function connectWithTicket(ticket: string, state: string) {
  if (!state) throw new Error("아지트가 확인표를 돌려주지 않았어요. 샘링크.kr 첫 화면에서 '아지트 계정으로 연결'을 다시 눌러 주세요.");
  return postConnect("/api/account/connect", { ticket, state });
}

// 아지트 안(iframe) 자동 연결: 부모 창이 아지트일 때만 이 화면이 부른다(아래 message 처리). /connect 화면에서는 쓰지 않는다.
export async function connectEmbedded(ticket: string) {
  return postConnect("/api/account/connect-embed", { ticket });
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
        const result = await connectEmbedded(data.ticket);
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

  // 정식 주소로 옮겨 온 연결 시작(위 startConnect)은 여기서 이어서 한다.
  useEffect(() => {
    if (isEmbedded) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get(RESTART_PARAM) !== "1") return;
    url.searchParams.delete(RESTART_PARAM);
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    void startConnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 연결을 누르면 먼저 서버에서 일회용 state 를 받아(쿠키로도 심김) 아지트로 보낸다 — 돌아올 때 같은 state 만 받아들인다.
  async function startConnect() {
    setNotice("");
    try {
      const response = await fetch("/api/account/connect-start", { method: "POST" });
      const data = (await response.json()) as { state?: string; origin?: string };
      if (!response.ok || !data.state) throw new Error("start failed");
      // 정식 주소가 아닌 곳(www·옛 주소)에서 눌렀다면 정식 주소로 옮겨 거기서 다시 시작한다 — 돌아올 곳과 시작한 곳이 같아야 확인표가 맞는다.
      if (data.origin) {
        const canonical = new URL(data.origin);
        if (canonical.host !== window.location.host || canonical.protocol !== window.location.protocol) {
          window.location.assign(`${canonical.origin}/?${RESTART_PARAM}=1`);
          return;
        }
      }
      window.location.assign(`${AGIT_CONNECT_URL}&state=${encodeURIComponent(data.state)}`);
    } catch {
      setNotice("연결을 시작하지 못했어요. 잠시 뒤 다시 눌러 주세요.");
    }
  }

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
        <div className="account-bar-head">
          <span className="account-bar-icon" aria-hidden="true">✅</span>
          <strong>아지트 {account.displayName} 계정에 저장 중</strong>
        </div>
        <ul className="account-bar-points">
          <li>어느 기기에서든 같은 링크 목록이 보여요</li>
        </ul>
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
      <div className="account-bar-head">
        <span className="account-bar-icon" aria-hidden="true">☁️</span>
        <strong>어디서든 내 링크 보기</strong>
      </div>
      <ul className="account-bar-points">
        {notice ? (
          <li>{notice}</li>
        ) : (
          <>
            <li>지금은 이 브라우저에만 저장돼요</li>
            <li>다른 기기에선 안 보이고, 쿠키를 지우면 사라져요</li>
          </>
        )}
      </ul>
      <button type="button" className="account-bar-action" onClick={startConnect}>아지트 계정으로 연결</button>
    </div>
  );
}
