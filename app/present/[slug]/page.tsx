import type { Metadata } from "next";
import { decodeSlugParam } from "@/lib/slug";
import PresentClient from "./present-client";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export const metadata: Metadata = {
  title: "발표 모드 | 샘링크",
};

export default async function PresentPage({ params }: PageProps) {
  const { slug } = await params;
  return <PresentClient slug={decodeSlugParam(slug)} />;
}
