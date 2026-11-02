import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/types/database";
import { loadTestUsers, type TestUser } from "../test-users";

const users = loadTestUsers();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const PREFIX = `rls-${Date.now()}`;

type Client = SupabaseClient<Database>;
type Hours = Database["public"]["Tables"]["operating_hours"]["Row"];

function newClient(apiKey = key): Client {
  return createClient<Database>(url, apiKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function signedIn(user: TestUser) {
  const client = newClient();
  const { error } = await client.auth.signInWithPassword({ email: user.email, password: user.password });
  if (error) throw error;
  return client;
}

function schoolToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date());
}

// Next date (in a week or more, so it is safely in the future) that falls on the given weekday.
function nextWeekday(day: number, minDaysAhead = 7) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + minDaysAhead);
  while (d.getUTCDay() !== day) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// The day after a "YYYY-MM-DD" date.
function addDay(date: string) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// Sunday 10:00–18:00, Tuesday 12:00–20:00, everything else closed.
const TEST_HOURS = [
  { day: 0, open: "10:00", close: "18:00" },
  { day: 2, open: "12:00", close: "20:00" },
];

describe.skipIf(!users)("RLS and RPCs for availability and closures (Development)", () => {
  let service: Client;
  let admin: Client;
  let admin2: Client;
  let superAdmin: Client;
  let teacher: Client;
  let teacher2: Client;
  let teacherInactive: Client;
  let anon: Client;
  const teacherIds: Record<"teacher" | "teacher2" | "teacherInactive", string> = { teacher: "", teacher2: "", teacherInactive: "" };
  let savedHours: Hours[] = [];
  let slotId: string;

  const add = (client: Client, teacherId: string, day: number, start: string, end: string) =>
    client.rpc("add_availability", { p_teacher_id: teacherId, p_day: day, p_start: start, p_end: end });

  const requestOf = async (id: string) => {
    const { data, error } = await service.from("availability_requests").select("*").eq("id", id).single();
    if (error) throw error;
    return data;
  };

  beforeAll(async () => {
    service = newClient(process.env.SUPABASE_SECRET_KEY!);
    anon = newClient();
    [admin, admin2, superAdmin, teacher, teacher2, teacherInactive] = await Promise.all([
      signedIn(users!.admin),
      signedIn(users!.admin2),
      signedIn(users!.superAdmin),
      signedIn(users!.teacher),
      signedIn(users!.teacher2),
      signedIn(users!.teacherInactive),
    ]);
    for (const k of ["teacher", "teacher2", "teacherInactive"] as const) {
      const { data, error } = await service.from("teachers").select("id").eq("profile_id", users![k].id).single();
      if (error) throw error;
      teacherIds[k] = data.id;
    }
    // Operating hours are school-wide: keep the current ones and restore them afterwards.
    const { data } = await service.from("operating_hours").select("*");
    savedHours = data ?? [];
    // Start each run without leftover availability of the test teachers.
    await service.from("teacher_availability").delete().in("teacher_id", Object.values(teacherIds));
  });

  afterAll(async () => {
    if (!service) return;
    const ids = Object.values(teacherIds).filter(Boolean);
    await service.from("availability_requests").delete().in("teacher_id", ids);
    await service.from("teacher_availability").delete().in("teacher_id", ids);
    await service.from("school_closures").delete().like("name", `${PREFIX}%`);
    await service.from("operating_hours").delete().gte("day_of_week", 0);
    if (savedHours.length) await service.from("operating_hours").insert(savedHours);
  });

  describe("operating hours", () => {
    it("an admin sets different hours per day", async () => {
      const { error } = await admin.rpc("set_operating_hours", { p_days: TEST_HOURS });
      expect(error).toBeNull();
      const { data } = await teacher.from("operating_hours").select("day_of_week, open_time, close_time").order("day_of_week");
      expect(data).toEqual([
        { day_of_week: 0, open_time: "10:00:00", close_time: "18:00:00" },
        { day_of_week: 2, open_time: "12:00:00", close_time: "20:00:00" },
      ]);
    });

    it("rejects closing before opening and times off the 15-minute grid", async () => {
      const bad = await admin.rpc("set_operating_hours", { p_days: [{ day: 1, open: "18:00", close: "10:00" }] });
      expect(bad.error?.message).toBe("invalid_input");
      const step = await admin.rpc("set_operating_hours", { p_days: [{ day: 1, open: "10:10", close: "18:00" }] });
      expect(step.error?.message).toBe("invalid_input");
      // A failed save leaves the previous hours untouched.
      const { count } = await service.from("operating_hours").select("*", { count: "exact", head: true });
      expect(count).toBe(2);
    });

    it("teachers and direct writes cannot change hours", async () => {
      const { error } = await teacher.rpc("set_operating_hours", { p_days: [] });
      expect(error?.message).toBe("not_allowed");
      const direct = await admin.from("operating_hours").update({ open_time: "06:00" }).eq("day_of_week", 0).select();
      expect(direct.data ?? []).toHaveLength(0);
    });
  });

  describe("adding availability", () => {
    it("a teacher adds a slot within the hours and it is active at once", async () => {
      const { data, error } = await add(teacher, teacherIds.teacher, 0, "10:00", "12:00");
      expect(error).toBeNull();
      slotId = data!;
      const { data: rows } = await teacher.from("teacher_availability").select("id, valid_to");
      expect(rows).toEqual([{ id: slotId, valid_to: null }]);
    });

    it("blocks slots outside the operating hours and on closed days", async () => {
      expect((await add(teacher, teacherIds.teacher, 0, "17:00", "19:00")).error?.message).toBe("outside_operating_hours");
      expect((await add(teacher, teacherIds.teacher, 1, "10:00", "11:00")).error?.message).toBe("outside_operating_hours");
    });

    it("blocks overlaps but allows adjacent slots", async () => {
      expect((await add(teacher, teacherIds.teacher, 0, "11:00", "13:00")).error?.message).toBe("availability_overlap");
      expect((await add(teacher, teacherIds.teacher, 0, "12:00", "13:00")).error).toBeNull();
    });

    it("rejects times off the 15-minute grid", async () => {
      expect((await add(teacher, teacherIds.teacher, 2, "12:10", "13:00")).error?.message).toBe("invalid_time_step");
    });

    it("a teacher cannot add for another teacher; an inactive teacher cannot add at all", async () => {
      expect((await add(teacher, teacherIds.teacher2, 0, "14:00", "15:00")).error?.message).toBe("not_allowed");
      expect((await add(teacherInactive, teacherIds.teacherInactive, 0, "14:00", "15:00")).error?.message).toBe("not_allowed");
    });

    it("an admin adds for a teacher; teachers see only their own slots", async () => {
      expect((await add(admin, teacherIds.teacher2, 2, "12:00", "14:00")).error).toBeNull();
      const { data } = await teacher.from("teacher_availability").select("teacher_id");
      expect(new Set(data!.map((r) => r.teacher_id))).toEqual(new Set([teacherIds.teacher]));
      const { data: inactiveView } = await teacherInactive.from("teacher_availability").select("id");
      expect(inactiveView).toEqual([]);
    });

    it("direct table writes are blocked", async () => {
      const { error } = await teacher
        .from("teacher_availability")
        .insert({ teacher_id: teacherIds.teacher, day_of_week: 2, start_time: "12:00", end_time: "13:00", valid_from: "2030-01-01" });
      expect(error).not.toBeNull();
    });
  });

  describe("removal and absence requests", () => {
    let removalId: string;

    it("a permanent removal stays pending and the slot remains active", async () => {
      const { data, error } = await teacher.rpc("remove_availability", {
        p_availability_id: slotId,
        p_kind: "remove_weekly",
        p_date: nextWeekday(0),
        p_reason: "שינוי במערכת",
      });
      expect(error).toBeNull();
      removalId = data!;
      expect((await requestOf(removalId)).status).toBe("pending");
      const { data: slot } = await service.from("teacher_availability").select("valid_to").eq("id", slotId).single();
      expect(slot!.valid_to).toBeNull();
    });

    it("rejects a second pending removal of the same slot and dates in the past", async () => {
      const again = await teacher.rpc("remove_availability", {
        p_availability_id: slotId, p_kind: "remove_weekly", p_date: nextWeekday(0), p_reason: "",
      });
      expect(again.error?.message).toBe("removal_pending");
      const past = await teacher.rpc("remove_availability", {
        p_availability_id: slotId, p_kind: "remove_once", p_date: "2020-01-05", p_reason: "",
      });
      expect(past.error?.message).toBe("date_past");
    });

    it("a one-time removal must fall on the slot's weekday", async () => {
      const { error } = await teacher.rpc("remove_availability", {
        p_availability_id: slotId, p_kind: "remove_once", p_date: nextWeekday(3), p_reason: "",
      });
      expect(error?.message).toBe("date_not_matching_day");
    });

    it("a teacher cannot request removal of another teacher's slot", async () => {
      const { error } = await teacher2.rpc("remove_availability", {
        p_availability_id: slotId, p_kind: "remove_once", p_date: nextWeekday(0), p_reason: "",
      });
      expect(error?.message).toBe("not_allowed");
    });

    it("a pending absence creates no absence row", async () => {
      const { data, error } = await teacher.rpc("report_absence", {
        p_teacher_id: teacherIds.teacher,
        p_start_date: nextWeekday(2),
        p_end_date: nextWeekday(2),
        p_start_time: "12:00",
        p_end_time: "15:00",
        p_reason: "תור לרופא",
      });
      expect(error).toBeNull();
      const { data: absences } = await service.from("teacher_absences").select("id").eq("request_id", data!);
      expect(absences).toEqual([]);
    });

    it("hours are allowed only for a single-day absence", async () => {
      const { error } = await teacher.rpc("report_absence", {
        p_teacher_id: teacherIds.teacher,
        p_start_date: nextWeekday(2),
        p_end_date: nextWeekday(4),
        p_start_time: "12:00",
        p_end_time: "15:00",
        p_reason: "",
      });
      expect(error?.message).toBe("invalid_input");
    });

    it("teachers cannot decide requests", async () => {
      const r = await requestOf(removalId);
      const { error } = await teacher.rpc("decide_availability_request", { p_id: removalId, p_version: r.version, p_approve: true, p_note: "" });
      expect(error?.message).toBe("not_allowed");
    });

    it("two admins deciding at the same time: exactly one succeeds", async () => {
      const r = await requestOf(removalId);
      const results = await Promise.all([
        admin.rpc("decide_availability_request", { p_id: removalId, p_version: r.version, p_approve: true, p_note: "" }),
        superAdmin.rpc("decide_availability_request", { p_id: removalId, p_version: r.version, p_approve: false, p_note: "לא" }),
      ]);
      const errors = results.map((x) => x.error?.message ?? null);
      expect(errors.filter((e) => e === null)).toHaveLength(1);
      expect(errors.filter((e) => e === "request_already_handled")).toHaveLength(1);
      const after = await requestOf(removalId);
      expect(after.version).toBe(r.version + 1);
    });

    it("a stale version is rejected", async () => {
      const { error } = await admin2.rpc("decide_availability_request", { p_id: removalId, p_version: 1, p_approve: true, p_note: "" });
      expect(error?.message).toBe("request_already_handled");
    });

    it("approving a permanent removal ends the slot the day before the chosen date", async () => {
      const { data: fresh } = await add(teacher, teacherIds.teacher, 2, "16:00", "18:00");
      const date = nextWeekday(2);
      const { data: id } = await teacher.rpc("remove_availability", {
        p_availability_id: fresh!, p_kind: "remove_weekly", p_date: date, p_reason: "",
      });
      const r = await requestOf(id!);
      expect((await admin.rpc("decide_availability_request", { p_id: id!, p_version: r.version, p_approve: true, p_note: "" })).error).toBeNull();
      const { data: slot } = await service.from("teacher_availability").select("valid_to").eq("id", fresh!).single();
      const dayBefore = new Date(`${date}T00:00:00Z`);
      dayBefore.setUTCDate(dayBefore.getUTCDate() - 1);
      expect(slot!.valid_to).toBe(dayBefore.toISOString().slice(0, 10));
    });

    it("approving a one-time removal creates an absence; rejecting leaves everything as is", async () => {
      const { data: approveId } = await teacher.rpc("remove_availability", {
        p_availability_id: (await teacherSlot()).id, p_kind: "remove_once", p_date: nextWeekday(0, 14), p_reason: "",
      });
      const r = await requestOf(approveId!);
      await admin.rpc("decide_availability_request", { p_id: approveId!, p_version: r.version, p_approve: true, p_note: "" });
      const { data: absence } = await service.from("teacher_absences").select("start_date, start_time").eq("request_id", approveId!).single();
      expect(absence).toEqual({ start_date: nextWeekday(0, 14), start_time: r.start_time });

      const { data: rejectId } = await teacher.rpc("report_absence", {
        p_teacher_id: teacherIds.teacher, p_start_date: nextWeekday(0, 21), p_end_date: addDay(nextWeekday(0, 21)),
        p_start_time: null as unknown as string, p_end_time: null as unknown as string, p_reason: "",
      });
      const r2 = await requestOf(rejectId!);
      await admin.rpc("decide_availability_request", { p_id: rejectId!, p_version: r2.version, p_approve: false, p_note: "חסר מורה מחליף" });
      const after = await requestOf(rejectId!);
      expect(after.status).toBe("rejected");
      expect(after.decision_note).toBe("חסר מורה מחליף");
      const { data: none } = await service.from("teacher_absences").select("id").eq("request_id", rejectId!);
      expect(none).toEqual([]);
    });

    async function teacherSlot() {
      const { data } = await service
        .from("teacher_availability")
        .select("id")
        .eq("teacher_id", teacherIds.teacher)
        .eq("day_of_week", 0)
        .eq("start_time", "12:00:00")
        .single();
      return data!;
    }

    it("a teacher cancels only their own pending request", async () => {
      const { data: id } = await teacher.rpc("report_absence", {
        p_teacher_id: teacherIds.teacher, p_start_date: nextWeekday(2, 28), p_end_date: nextWeekday(2, 28),
        p_start_time: null as unknown as string, p_end_time: null as unknown as string, p_reason: "",
      });
      const r = await requestOf(id!);
      expect((await teacher2.rpc("cancel_availability_request", { p_id: id!, p_version: r.version })).error?.message).toBe("not_allowed");
      expect((await teacher.rpc("cancel_availability_request", { p_id: id!, p_version: r.version })).error).toBeNull();
      expect((await requestOf(id!)).status).toBe("cancelled");
    });

    it("an admin removes a slot directly: applied at once and logged as an approved request", async () => {
      const { data: s } = await add(admin, teacherIds.teacher2, 0, "14:00", "16:00");
      const { data: id, error } = await admin.rpc("remove_availability", {
        p_availability_id: s!, p_kind: "remove_weekly", p_date: schoolToday(), p_reason: "",
      });
      expect(error).toBeNull();
      const r = await requestOf(id!);
      expect(r.status).toBe("approved");
      expect(r.requested_by).toBe(users!.admin.id);
      expect(r.decided_by).toBe(users!.admin.id);
      // Removed before it ever applied: the slot is gone.
      const { data: gone } = await service.from("teacher_availability").select("id").eq("id", s!);
      expect(gone).toEqual([]);
    });

    it("an admin reports an absence directly", async () => {
      const { data: id } = await admin.rpc("report_absence", {
        p_teacher_id: teacherIds.teacher2, p_start_date: nextWeekday(1), p_end_date: nextWeekday(1, 9),
        p_start_time: null as unknown as string, p_end_time: null as unknown as string, p_reason: "",
      });
      const { data: absence } = await service.from("teacher_absences").select("id").eq("request_id", id!);
      expect(absence).toHaveLength(1);
    });

    it("teachers see only their own requests; the internal apply function is not callable", async () => {
      const { data } = await teacher2.from("availability_requests").select("teacher_id");
      expect(new Set(data!.map((r) => r.teacher_id))).toEqual(new Set([teacherIds.teacher2]));
      const { error } = await admin.rpc("apply_availability_request" as never, { p_request_id: removalId } as never);
      expect(error).not.toBeNull();
    });
  });

  describe("closures", () => {
    let closureId: string;
    const key = `${PREFIX}-yom-kippur`;

    it("an admin saves a holiday closure and a custom closure", async () => {
      const holiday = await admin.rpc("save_closure", {
        p_name: `${PREFIX} יום כיפור`, p_start_date: "2030-10-07", p_end_date: "2030-10-07", p_holiday_key: key,
      });
      expect(holiday.error).toBeNull();
      closureId = holiday.data!;
      const custom = await admin.rpc("save_closure", {
        p_name: `${PREFIX} חופשת קיץ`, p_start_date: "2030-08-01", p_end_date: "2030-08-10", p_holiday_key: "",
      });
      expect(custom.error).toBeNull();
      const { data } = await teacher.from("school_closures").select("source").like("name", `${PREFIX}%`).order("start_date");
      expect(data).toEqual([{ source: "custom" }, { source: "holiday" }]);
    });

    it("the same holiday cannot be active twice; after cancelling it can be chosen again", async () => {
      const dup = await admin.rpc("save_closure", {
        p_name: `${PREFIX} יום כיפור`, p_start_date: "2030-10-07", p_end_date: "2030-10-07", p_holiday_key: key,
      });
      expect(dup.error?.message).toBe("closure_exists");
      expect((await admin.rpc("cancel_closure", { p_id: closureId })).error).toBeNull();
      const { data: cancelled } = await service.from("school_closures").select("status").eq("id", closureId).single();
      expect(cancelled!.status).toBe("cancelled");
      const again = await admin.rpc("save_closure", {
        p_name: `${PREFIX} יום כיפור`, p_start_date: "2030-10-07", p_end_date: "2030-10-07", p_holiday_key: key,
      });
      expect(again.error).toBeNull();
    });

    it("teachers cannot write closures", async () => {
      const { error } = await teacher.rpc("save_closure", {
        p_name: `${PREFIX} x`, p_start_date: "2030-01-01", p_end_date: "2030-01-01", p_holiday_key: "",
      });
      expect(error?.message).toBe("not_allowed");
      expect((await teacher.rpc("cancel_closure", { p_id: closureId })).error?.message).toBe("not_allowed");
    });
  });

  it("anonymous users see nothing", async () => {
    for (const table of ["operating_hours", "teacher_availability", "availability_requests", "teacher_absences", "school_closures"] as const) {
      const { data } = await anon.from(table).select("*");
      expect(data ?? []).toEqual([]);
    }
  });
});
