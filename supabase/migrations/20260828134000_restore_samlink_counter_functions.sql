-- 샘링크를 아지트 DB의 samlink 스키마로 옮길 때 누락된 두 통계 함수를 복구한다.
-- short_links INSERT/DELETE 트리거는 sync_short_link_stats()를 거쳐 이 함수들을 호출한다.
-- samlink 스키마가 없는 기존 로컬 public 구성에서는 아무것도 바꾸지 않는다.

DO $migration$
BEGIN
  IF to_regnamespace('samlink') IS NULL THEN
    RAISE NOTICE 'samlink schema is absent; skipping samlink counter repair';
    RETURN;
  END IF;

  EXECUTE $sql$
    CREATE OR REPLACE FUNCTION samlink.increment_created_short_links(amount integer)
    RETURNS void
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = samlink
    AS $function$
    DECLARE
      today date := timezone('utc', now())::date;
      created_delta integer := greatest(coalesce(amount, 0), 0);
      today_created integer := 0;
      alert_key text := format('daily-spike-%s', today::text);
      alert_threshold constant integer := 300;
    BEGIN
      UPDATE samlink.short_link_stats
      SET total_created = total_created + created_delta
      WHERE key = 'global';

      IF NOT FOUND THEN
        INSERT INTO samlink.short_link_stats (key, total_created, total_deleted)
        VALUES ('global', created_delta, 0);
      END IF;

      INSERT INTO samlink.short_link_daily_stats (day, created_count, deleted_count, updated_at)
      VALUES (today, created_delta, 0, timezone('utc', now()))
      ON CONFLICT (day)
      DO UPDATE SET
        created_count = samlink.short_link_daily_stats.created_count + created_delta,
        updated_at = timezone('utc', now())
      RETURNING created_count INTO today_created;

      IF today_created >= alert_threshold THEN
        INSERT INTO samlink.short_link_notifications (alert_key, kind, title, message)
        VALUES (
          alert_key,
          'daily_spike',
          '오늘 생성 수가 많습니다',
          format('오늘 생성된 단축 주소가 %s개를 넘었습니다. 남용 여부를 확인해 주세요.', today_created)
        )
        ON CONFLICT (alert_key) DO NOTHING;
      END IF;
    END;
    $function$;
  $sql$;

  EXECUTE $sql$
    CREATE OR REPLACE FUNCTION samlink.increment_deleted_short_links(amount integer)
    RETURNS void
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = samlink
    AS $function$
    DECLARE
      today date := timezone('utc', now())::date;
      deleted_delta integer := greatest(coalesce(amount, 0), 0);
    BEGIN
      UPDATE samlink.short_link_stats
      SET total_deleted = total_deleted + deleted_delta
      WHERE key = 'global';

      IF NOT FOUND THEN
        INSERT INTO samlink.short_link_stats (key, total_created, total_deleted)
        VALUES ('global', 0, deleted_delta);
      END IF;

      INSERT INTO samlink.short_link_daily_stats (day, created_count, deleted_count, updated_at)
      VALUES (today, 0, deleted_delta, timezone('utc', now()))
      ON CONFLICT (day)
      DO UPDATE SET
        deleted_count = samlink.short_link_daily_stats.deleted_count + deleted_delta,
        updated_at = timezone('utc', now());
    END;
    $function$;
  $sql$;

  REVOKE ALL ON FUNCTION samlink.increment_created_short_links(integer)
    FROM PUBLIC, anon, authenticated;
  REVOKE ALL ON FUNCTION samlink.increment_deleted_short_links(integer)
    FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION samlink.increment_created_short_links(integer) TO service_role;
  GRANT EXECUTE ON FUNCTION samlink.increment_deleted_short_links(integer) TO service_role;
END;
$migration$;
