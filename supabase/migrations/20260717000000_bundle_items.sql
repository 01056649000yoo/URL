-- 링크 묶음(수업 세트): 하나의 짧은 주소로 여러 링크 목록 페이지를 제공
-- bundle_items가 null이면 일반 단축 링크, 값이 있으면 {"title": text, "items": [{"label": text, "url": text}]} 형태의 묶음
alter table public.short_links
add column if not exists bundle_items jsonb;
