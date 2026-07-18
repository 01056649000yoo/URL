import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "만료된 링크 | 샘링크",
};

export default function ExpiredPage() {
  return (
    <main className="bundle-shell">
      <section className="bundle-card">
        <p className="bundle-kicker">샘링크</p>
        <h1 className="bundle-title">이 링크는 만료되었어요</h1>
        <p className="bundle-empty">
          유지 기간이 지나 지금은 사용할 수 없는 짧은 주소입니다.
          <br />
          링크를 만든 선생님은 <strong>만료 후 30일 안에</strong> 샘링크의 &lsquo;내 링크&rsquo;에서
          복구할 수 있어요. 복구되면 이 QR·주소가 그대로 다시 작동합니다.
        </p>
        <p className="bundle-footer">
          <Link href="/">샘링크 홈으로 가기</Link>
        </p>
      </section>
    </main>
  );
}
