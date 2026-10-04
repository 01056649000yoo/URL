-- 2026-10-05 아지트 회원 탈퇴(계정 삭제) 때 쌤링크 계정 연결 줄도 함께 지운다(개인정보처리방침 제4조와 맞춤).
-- 링크 자체는 계정과 무관한 단축 주소라 남고(기기 목록·만료 정리 규칙대로), 계정 연결만 사라진다.
delete from samlink.short_link_account_access a
where not exists (select 1 from auth.users u where u.id = a.user_id);

alter table samlink.short_link_account_access
  drop constraint if exists short_link_account_access_user_fk,
  add constraint short_link_account_access_user_fk foreign key (user_id) references auth.users(id) on delete cascade;
