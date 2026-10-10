import type { Metadata } from "next";
import { headers } from "next/headers";
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { decodeSlugParam } from "@/lib/slug";
import { lookupLinkGuarded } from "@/lib/link-lookup";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ slug: string }>;
};

type BundlePayload = {
  title?: string;
  items?: { label?: string; url?: string }[];
};

type BundleLinkRow = {
  slug: string;
  bundle_items: BundlePayload | null;
  is_active: boolean;
  expires_at: string | null;
};

// 제목(generateMetadata)과 본문이 같은 요청에서 한 번만 조회하도록 묶는다 — 없는 주소를 두 번 세지 않게.
const loadBundle = cache(async (rawSlug: string) => {
  const slug = decodeSlugParam(rawSlug);
  const admin = createAdminClient();

  // 없는 주소를 IP별로 세서 찍어 보기를 막는다(2026-10-10, lib/link-lookup.ts).
  const lookup = await lookupLinkGuarded(admin, { headers: await headers() }, slug);
  if (lookup.status === "blocked") {
    return { blocked: true as const };
  }
  if (lookup.status === "missing") {
    return null;
  }

  const data: BundleLinkRow = {
    slug,
    bundle_items: (lookup.link.bundle_items as BundlePayload | null) ?? null,
    is_active: lookup.link.is_active,
    expires_at: lookup.link.expires_at,
  };
  if (!data.bundle_items) {
    return null;
  }

  const expiresAt = data.expires_at ? new Date(data.expires_at).getTime() : null;
  const isExpired = expiresAt !== null && expiresAt <= Date.now();
  if (!data.is_active || isExpired) {
    return null;
  }

  return data;
});

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const bundle = await loadBundle(slug);
  const title = bundle && !("blocked" in bundle) ? bundle.bundle_items?.title?.trim() : undefined;
  return {
    title: title ? `${title} | 샘링크` : "링크 묶음 | 샘링크",
  };
}

export default async function BundlePage({ params }: PageProps) {
  const { slug } = await params;
  const bundle = await loadBundle(slug);

  if (bundle && "blocked" in bundle) {
    return (
      <main className="bundle-shell">
        <section className="bundle-card">
          <h1 className="bundle-title">잠시 후 다시 열어 주세요</h1>
          <p className="bundle-empty">없는 주소를 너무 많이 열어서 잠깐 쉬고 있어요. 몇 분 뒤에 다시 시도해 주세요.</p>
        </section>
      </main>
    );
  }

  if (!bundle) {
    return (
      <main className="bundle-shell">
        <section className="bundle-card">
          <h1 className="bundle-title">링크를 찾을 수 없습니다</h1>
          <p className="bundle-empty">주소가 잘못되었거나 만료된 링크 묶음입니다.</p>
        </section>
      </main>
    );
  }

  const title = bundle.bundle_items?.title?.trim() || "링크 목록";
  const items = (bundle.bundle_items?.items ?? []).filter((item) => item.url);

  return (
    <main className="bundle-shell">
      <section className="bundle-card">
        <p className="bundle-kicker">샘링크 · 링크 묶음</p>
        <h1 className="bundle-title">{title}</h1>
        <div className="bundle-list">
          {items.map((item, index) => {
            let hostLabel = "";
            try {
              hostLabel = new URL(item.url as string).hostname;
            } catch {
              hostLabel = "";
            }
            return (
              <a
                className="bundle-item"
                key={`${item.url}-${index}`}
                href={item.url}
                target="_blank"
                rel="noreferrer"
              >
                <span className="bundle-item-index">{index + 1}</span>
                <span className="bundle-item-body">
                  <strong>{item.label?.trim() || hostLabel || `링크 ${index + 1}`}</strong>
                  {hostLabel ? <span className="bundle-item-host">{hostLabel}</span> : null}
                </span>
                <span className="bundle-item-arrow" aria-hidden="true">
                  →
                </span>
              </a>
            );
          })}
        </div>
        <p className="bundle-footer">
          샘링크 · 샘링크.kr ·{" "}
          <a
            href={`mailto:yshgg@naver.com?subject=${encodeURIComponent("[샘링크 신고] 악성·부적절 링크")}&body=${encodeURIComponent(`신고할 짧은 주소: 샘링크.kr/${bundle.slug}\n사유: `)}`}
          >
            이 묶음 신고
          </a>
        </p>
      </section>
    </main>
  );
}
