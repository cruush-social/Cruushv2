import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const realPostgresUrl = process.env.CRUUSH_REAL_POSTGRES_URL;
const preservedUserId = "78000000-0000-4000-8000-000000000001";
const validUserId = "78000000-0000-4000-8000-000000000002";
const cappedUserId = "78000000-0000-4000-8000-000000000003";
const invariantUserId = "78000000-0000-4000-8000-000000000004";
const { Pool } = pg;

describe.skipIf(!realPostgresUrl)("reward integrity with real PostgreSQL", () => {
  let pool: InstanceType<typeof Pool>;

  beforeAll(() => {
    if (!realPostgresUrl) {
      return;
    }

    const databaseName = decodeURIComponent(
      new URL(realPostgresUrl).pathname.split("/").filter(Boolean).pop() ?? ""
    );
    if (!/^cruush_reward_integrity(?:_[a-z0-9]+)*$/.test(databaseName)) {
      throw new Error(
        `CRUUSH_REAL_POSTGRES_URL must name a disposable reward-integrity database; received ${databaseName || "an empty database name"}.`
      );
    }

    pool = new Pool({ connectionString: realPostgresUrl, max: 1 });
  });

  afterAll(async () => {
    if (pool) {
      await pool.end();
    }
  });

  it("preserves prior gifts while enforcing earned, one-day, capped check-in rewards", async () => {
    const client = await pool.connect();

    const expectRejectedGrant = async (input: {
      savepoint: string;
      userId: string;
      days: number;
      streak: number;
      activityDate: string;
      expectedMessage: string;
      source?: "activity_recurring" | "activity_long_bonus";
    }) => {
      await client.query(`savepoint ${input.savepoint}`);
      let rejection: unknown;

      try {
        await client.query(
          `insert into reward_grants (
             user_id, source, days, idempotency_key, milestone_key, audit_metadata
           ) values (
             $1::uuid, $2, $3, $4, $5,
             jsonb_build_object('streak', $6::int, 'activityDate', $7::text, 'timezone', 'UTC')
           )`,
          [
            input.userId,
            input.source ?? "activity_recurring",
            input.days,
            `activity:recurring:${input.userId}:${input.streak}`,
            `streak:${input.streak}`,
            input.streak,
            input.activityDate
          ]
        );
      } catch (error) {
        rejection = error;
      }

      await client.query(`rollback to savepoint ${input.savepoint}`);
      expect(rejection).toMatchObject({ code: "23514" });
      expect(String((rejection as Error | undefined)?.message)).toContain(input.expectedMessage);
    };

    try {
      await client.query("begin");
      await client.query("set local statement_timeout = '10s'");
      await client.query(
        `insert into app_users (id, email, password_hash)
         values
           ($1::uuid, 'reward-preserved@example.test', 'test-hash'),
           ($2::uuid, 'reward-valid@example.test', 'test-hash'),
           ($3::uuid, 'reward-capped@example.test', 'test-hash')`,
        [preservedUserId, validUserId, cappedUserId]
      );

      await client.query(
        "alter table reward_grants disable trigger reward_grants_activity_earned_boundary_guard"
      );
      await client.query(
        "alter table reward_grants drop constraint reward_grants_check_in_only_shape"
      );
      await client.query(
        `insert into reward_grants (
           user_id, source, days, idempotency_key, milestone_key, audit_metadata
         ) values (
           $1::uuid, 'activity_recurring', 7, 'reward-integrity:preserved-overgrant', 'streak:8',
           '{"streak":8,"activityDate":"2026-08-08","timezone":"UTC"}'::jsonb
         )`,
        [preservedUserId]
      );
      await client.query(
        `alter table reward_grants
           add constraint reward_grants_check_in_only_shape
           check (
             source not in ('activity_recurring', 'activity_long_bonus')
             or (source = 'activity_recurring' and days = 1)
           ) not valid`
      );
      await client.query(
        "alter table reward_grants enable trigger reward_grants_activity_earned_boundary_guard"
      );

      // Represent action credits that existed before the check-in-only invariant.
      // PostgreSQL NOT VALID preserves these rows while enforcing all later writes.
      await client.query(
        "alter table daily_activity_credits drop constraint daily_activity_credits_check_in_only"
      );
      await client.query(
        `insert into daily_activity_credits (
           user_id, activity_date, timezone, activity_type, source_event_id
         ) values
           ($1::uuid, date '2026-08-06', 'UTC', 'message', 'legacy-preserved'),
           ($2::uuid, date '2026-08-07', 'UTC', 'message', 'wrong-evidence')`,
        [preservedUserId, validUserId]
      );
      await client.query(
        `alter table daily_activity_credits
           add constraint daily_activity_credits_check_in_only
           check (activity_type = 'check_in') not valid`
      );

      const preserved = await client.query<{ count: string }>(
        `select count(*)::text as count
         from reward_grants
         where idempotency_key = 'reward-integrity:preserved-overgrant'`
      );
      expect(preserved.rows[0]?.count).toBe("1");

      const preservedLegacyCredit = await client.query<{ count: string }>(
        `select count(*)::text as count
         from daily_activity_credits
         where user_id = $1::uuid
           and activity_date = date '2026-08-06'
           and activity_type = 'message'
           and source_event_id = 'legacy-preserved'`,
        [preservedUserId]
      );
      expect(preservedLegacyCredit.rows[0]?.count).toBe("1");

      await expectRejectedGrant({
        savepoint: "retired_bonus",
        userId: validUserId,
        source: "activity_long_bonus",
        days: 1,
        streak: 7,
        activityDate: "2026-08-07",
        expectedMessage: "legacy activity bonus grants are disabled"
      });

      await client.query(
        `insert into user_activity_streaks (
           user_id, current_streak, longest_streak, last_activity_date
         ) values ($1::uuid, 7, 7, date '2026-08-07')`,
        [validUserId]
      );

      await expectRejectedGrant({
        savepoint: "wrong_evidence",
        userId: validUserId,
        days: 1,
        streak: 7,
        activityDate: "2026-08-07",
        expectedMessage: "completed seven-day check-in boundary"
      });

      await client.query(
        `update daily_activity_credits
         set activity_type = 'check_in'
         where user_id = $1::uuid and activity_date = date '2026-08-07'`,
        [validUserId]
      );
      await client.query(
        `insert into reward_grants (
           user_id, source, days, idempotency_key, milestone_key, audit_metadata
         ) values (
           $1::uuid, 'activity_recurring', 1, $2, 'streak:7',
           '{"streak":7,"activityDate":"2026-08-07","timezone":"UTC"}'::jsonb
         )`,
        [validUserId, `activity:recurring:${validUserId}:7`]
      );

      await client.query(
        `insert into daily_activity_credits (
           user_id, activity_date, timezone, activity_type, source_event_id
         ) values ($1::uuid, date '2026-08-08', 'UTC', 'check_in', 'non-boundary')`,
        [validUserId]
      );
      await client.query(
        `update user_activity_streaks
         set current_streak = 8, longest_streak = 8, last_activity_date = date '2026-08-08'
         where user_id = $1::uuid`,
        [validUserId]
      );
      await expectRejectedGrant({
        savepoint: "non_boundary",
        userId: validUserId,
        days: 1,
        streak: 8,
        activityDate: "2026-08-08",
        expectedMessage: "completed seven-day check-in boundary"
      });

      await client.query("savepoint misconfigured_reward");
      await client.query(
        "alter table reward_settings disable trigger reward_settings_daily_check_in_guard"
      );
      await client.query(
        `update reward_settings
         set value = case key
           when 'recurring_streak_reward_days' then '7'::jsonb
           when 'eligible_activity_types' then '["message"]'::jsonb
           else value
         end
         where key in ('recurring_streak_reward_days', 'eligible_activity_types')`
      );
      await client.query(
        "alter table reward_settings enable trigger reward_settings_daily_check_in_guard"
      );
      let configurationError: unknown;
      try {
        await client.query(
          `insert into reward_grants (
             user_id, source, days, idempotency_key, milestone_key, audit_metadata
           ) values (
             $1::uuid, 'activity_recurring', 1, $2, 'streak:8',
             '{"streak":8,"activityDate":"2026-08-08","timezone":"UTC"}'::jsonb
           )`,
          [validUserId, `activity:recurring:${validUserId}:8`]
        );
      } catch (error) {
        configurationError = error;
      }
      await client.query("rollback to savepoint misconfigured_reward");
      expect(configurationError).toMatchObject({ code: "23514" });
      expect(String((configurationError as Error | undefined)?.message)).toContain(
        "seven check-ins, one reward day, and five days per rolling 30 days"
      );

      await client.query(
        `insert into daily_activity_credits (
           user_id, activity_date, timezone, activity_type, source_event_id
         ) values ($1::uuid, date '2026-08-14', 'UTC', 'check_in', 'oversized')`,
        [validUserId]
      );
      await client.query(
        `update user_activity_streaks
         set current_streak = 14, longest_streak = 14, last_activity_date = date '2026-08-14'
         where user_id = $1::uuid`,
        [validUserId]
      );
      await expectRejectedGrant({
        savepoint: "oversized_reward",
        userId: validUserId,
        days: 2,
        streak: 14,
        activityDate: "2026-08-14",
        expectedMessage: "completed seven-day check-in boundary"
      });

      for (let boundary = 7; boundary <= 35; boundary += 7) {
        const day = String(boundary / 7).padStart(2, "0");
        const activityDate = `2026-07-${day}`;
        await client.query(
          `insert into daily_activity_credits (
             user_id, activity_date, timezone, activity_type, source_event_id
           ) values ($1::uuid, $2::date, 'UTC', 'check_in', $3)`,
          [cappedUserId, activityDate, `cap-${boundary}`]
        );
        await client.query(
          `insert into user_activity_streaks (
             user_id, current_streak, longest_streak, last_activity_date
           ) values ($1::uuid, $2, $2, $3::date)
           on conflict (user_id) do update
           set current_streak = excluded.current_streak,
               longest_streak = excluded.longest_streak,
               last_activity_date = excluded.last_activity_date`,
          [cappedUserId, boundary, activityDate]
        );
        await client.query(
          `insert into reward_grants (
             user_id, source, days, idempotency_key, milestone_key, audit_metadata
           ) values (
             $1::uuid, 'activity_recurring', 1, $2, $3,
             jsonb_build_object('streak', $4::int, 'activityDate', $5::text, 'timezone', 'UTC')
           )`,
          [
            cappedUserId,
            `activity:recurring:${cappedUserId}:${boundary}`,
            `streak:${boundary}`,
            boundary,
            activityDate
          ]
        );
      }

      await client.query(
        `insert into daily_activity_credits (
           user_id, activity_date, timezone, activity_type, source_event_id
         ) values ($1::uuid, date '2026-08-11', 'UTC', 'check_in', 'cap-42')`,
        [cappedUserId]
      );
      await client.query(
        `update user_activity_streaks
         set current_streak = 42, longest_streak = 42, last_activity_date = date '2026-08-11'
         where user_id = $1::uuid`,
        [cappedUserId]
      );
      await expectRejectedGrant({
        savepoint: "rolling_cap",
        userId: cappedUserId,
        days: 1,
        streak: 42,
        activityDate: "2026-08-11",
        expectedMessage: "activity reward exceeds the rolling 30-day cap"
      });

      const finalCounts = await client.query<{
        preserved: string;
        valid: string;
        capped: string;
      }>(
        `select
           count(*) filter (where idempotency_key = 'reward-integrity:preserved-overgrant')::text as preserved,
           count(*) filter (where user_id = $1::uuid and source = 'activity_recurring')::text as valid,
           count(*) filter (where user_id = $2::uuid and source = 'activity_recurring')::text as capped
         from reward_grants`,
        [validUserId, cappedUserId]
      );
      expect(finalCounts.rows[0]).toEqual({ preserved: "1", valid: "1", capped: "5" });

      await client.query("rollback");
    } finally {
      try {
        await client.query("rollback");
      } catch {
        // The transaction may already be rolled back.
      }
      client.release();
    }
  });

  it("rejects unsafe reward settings and new non-check-in credits", async () => {
    const client = await pool.connect();

    try {
      await client.query("begin");
      await client.query("set local statement_timeout = '10s'");
      await client.query(
        `insert into app_users (id, email, password_hash)
         values ($1::uuid, 'reward-invariant@example.test', 'test-hash')`,
        [invariantUserId]
      );

      await client.query("savepoint unsafe_setting");
      let unsafeSettingError: unknown;
      try {
        await client.query(
          `update reward_settings
           set value = '7'::jsonb
           where key = 'recurring_streak_reward_days'`
        );
      } catch (error) {
        unsafeSettingError = error;
      }
      await client.query("rollback to savepoint unsafe_setting");
      expect(unsafeSettingError).toMatchObject({ code: "23514" });
      expect(String((unsafeSettingError as Error | undefined)?.message)).toContain(
        "unsafe daily check-in reward setting is forbidden"
      );

      await client.query("savepoint non_check_in_credit");
      let nonCheckInError: unknown;
      try {
        await client.query(
          `insert into daily_activity_credits (
             user_id, activity_date, timezone, activity_type, source_event_id
           ) values ($1::uuid, date '2026-08-11', 'UTC', 'message', 'forbidden-message')`,
          [invariantUserId]
        );
      } catch (error) {
        nonCheckInError = error;
      }
      await client.query("rollback to savepoint non_check_in_credit");
      expect(nonCheckInError).toMatchObject({ code: "23514" });
      expect(String((nonCheckInError as Error | undefined)?.message)).toContain(
        "daily_activity_credits_check_in_only"
      );

      await client.query("savepoint unsafe_grant_shape");
      await client.query(
        "alter table reward_grants disable trigger reward_grants_activity_earned_boundary_guard"
      );
      let unsafeGrantShapeError: unknown;
      try {
        await client.query(
          `insert into reward_grants (
             user_id, source, days, idempotency_key, milestone_key, audit_metadata
           ) values (
             $1::uuid, 'activity_recurring', 7, 'reward-integrity:forbidden-shape',
             'streak:7', '{"streak":7,"activityDate":"2026-08-11"}'::jsonb
           )`,
          [invariantUserId]
        );
      } catch (error) {
        unsafeGrantShapeError = error;
      }
      await client.query("rollback to savepoint unsafe_grant_shape");
      expect(unsafeGrantShapeError).toMatchObject({ code: "23514" });
      expect(String((unsafeGrantShapeError as Error | undefined)?.message)).toContain(
        "reward_grants_check_in_only_shape"
      );

      await client.query(
        `insert into daily_activity_credits (
           user_id, activity_date, timezone, activity_type, source_event_id
         ) values ($1::uuid, date '2026-08-11', 'UTC', 'check_in', 'allowed-check-in')`,
        [invariantUserId]
      );
      const credits = await client.query<{ activity_type: string }>(
        `select activity_type
         from daily_activity_credits
         where user_id = $1::uuid`,
        [invariantUserId]
      );
      expect(credits.rows).toEqual([{ activity_type: "check_in" }]);

      await client.query("rollback");
    } finally {
      try {
        await client.query("rollback");
      } catch {
        // The transaction may already be rolled back.
      }
      client.release();
    }
  });
});
