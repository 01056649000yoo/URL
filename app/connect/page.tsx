"use client";

import { useEffect, useState } from "react";
import { connectWithTicket } from "../account-bar";

// 아지트에서 돌아오는 곳: /connect#ticket=<1분짜리 연결표>.
// 연결표는 주소 # 뒤에 있어 서버 로그·Referer 에 남지 않고, 읽은 즉시 주소에서 지운다.
export default function ConnectPage() {
  const [message, setMessage] = useState("아지트 계정에 연결하는 중입니다...");
  const [done, setDone] = useState(false);

  useEffect(() => {
    const ticket = new URLSearchParams(window.location.hash.slice(1)).get("ticket") ?? "";
    window.history.replaceState(null, "", "/connect");
    if (!ticket) {
      setMessage("연결 정보가 없습니다. 쌤링크 첫 화면에서 다시 눌러 주세요.");
      setDone(true);
      return;
    }
    connectWithTicket(ticket)
      .then((result) => {
        setMessage(`아지트 ${result.displayName ?? "선생님"} 계정에 연결했습니다.${result.moved ? ` 이 브라우저의 링크 ${result.moved}개를 계정에 담았어요.` : ""}`);
        setTimeout(() => window.location.replace("/"), 1800);
      })
      .catch((error: Error) => setMessage(error.message))
      .finally(() => setDone(true));
  }, []);

  return (
    <main className="shell">
      <section className="panel" style={{ maxWidth: 520, margin: "60px auto", textAlign: "center", display: "grid", gap: 16 }}>
        <h1 style={{ margin: 0, fontSize: "1.3rem" }}>쌤링크 계정 연결</h1>
        <p style={{ margin: 0 }} role="status">{message}</p>
        {done ? <a href="/" className="account-bar-action" style={{ justifySelf: "center" }}>쌤링크로 돌아가기</a> : null}
      </section>
    </main>
  );
}
