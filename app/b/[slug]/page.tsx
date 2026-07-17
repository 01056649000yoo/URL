import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { decodeSlugParam } from "@/lib/slug";

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

async function loadBundle(rawSlug: string) {
  const slug = decodeSlugParam(rawSlug);
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("short_links")
    .select("slug, bundle_items, is_active, expires_at")
    .eq("slug", slug)
    .maybeSingle<BundleLinkRow>();

  if (error || !data || !data.bundle_items) {
    return null;
  }

  const expiresAt = data.expires_at ? new Date(data.expires_at).getTime() : null;
  const isExpired = expiresAt !== null && expiresAt <= Date.now();
  if (!data.is_active || isExpired) {
    return null;
  }

  return data;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const bundle = await loadBundle(slug);
  const title = bundle?.bundle_items?.title?.trim();
  return {
    title: title ? `${title} | 샘링크` : "링크 묶음 | 샘링크",
  };
}

export default async function BundlePage({ params }: PageProps) {
  const { slug } = await params;
  const bundle = await loadBundle(slug);

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
        <p className="bundle-footer">샘링크 · 샘링크.kr</p>
      </section>
    </main>
  );
}
