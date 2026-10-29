import { createHash, randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/types/database";
import { loadTestUsers, type TestUser } from "../test-users";

const users = loadTestUsers();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const PREFIX = `rls-${Date.now()}`;

type Client = SupabaseClient<Database>;

function newClient(apiKey = key): Client {
  return createClient<Database>(url, apiKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function signedIn(user: TestUser) {
  const client = newClient();
  const { error } = await client.auth.signInWithPassword({ email: user.email, password: user.password });
  if (error) throw error;
  return client;
}

const tokenHash = () => createHash("sha256").update(randomBytes(32)).digest("hex");

describe.skipIf(!users)("RLS and RPCs for staff management (Development)", () => {
  let service: Client;
  let superAdmin: Client;
  let admin: Client;
  let teacher: Client;
  let teacherInactive: Client;
  let lessonTypeId: string;
  let teacherId: string;
  const createdAuthUsers: string[] = [];

  beforeAll(async () => {
    service = newClient(process.env.SUPABASE_SECRET_KEY!);
    [superAdmin, admin, teacher, teacherInactive] = await Promise.all([
      signedIn(users!.superAdmin),
      signedIn(users!.admin),
      signedIn(users!.teacher),
      signedIn(users!.teacherInactive),
    ]);
  });

  afterAll(async () => {
    if (!service) return;
    await service.from("invitations").delete().like("email", `${PREFIX}%`);
    await service.from("teachers").delete().like("email", `${PREFIX}%`);
    await service.from("lesson_types").delete().like("name", `${PREFIX}%`);
    for (const id of createdAuthUsers) await service.auth.admin.deleteUser(id);
  });

  describe("lesson types", () => {
    it("an admin can create, update and delete a lesson type", async () => {
      const { data, error } = await admin
        .from("lesson_types")
        .insert({ name: `${PREFIX} פסנתר`, default_duration_minutes: 45, color: "#38BDF8" })
        .select("id")
        .single();
      expect(error).toBeNull();
      lessonTypeId = data!.id;

      const { error: updateError } = await admin
        .from("lesson_types")
        .update({ default_duration_minutes: 60 })
        .eq("id", lessonTypeId);
      expect(updateError).toBeNull();

      const temp = await admin
        .from("lesson_types")
        .insert({ name: `${PREFIX} זמני`, default_duration_minutes: 30, color: "#F472B6" })
        .select("id")
        .single();
      const { error: deleteError } = await admin.from("lesson_types").delete().eq("id", temp.data!.id);
      expect(deleteError).toBeNull();
    });

    it("a teacher can read lesson types but not write them", async () => {
      const { data } = await teacher.from("lesson_types").select("id");
      expect(data!.length).toBeGreaterThan(0);

      const { error } = await teacher
        .from("lesson_types")
        .insert({ name: `${PREFIX} מורה`, default_duration_minutes: 45, color: "#38BDF8" });
      expect(error).not.toBeNull();

      const { data: updated } = await teacher
        .from("lesson_types")
        .update({ default_duration_minutes: 10 })
        .eq("id", lessonTypeId)
        .select("id");
      expect(updated ?? []).toHaveLength(0);
    });

    it("the color picker returns a palette color", async () => {
      const { data, error } = await admin.rpc("pick_lesson_type_color", { p_palette: ["#111111", "#222222"] });
      expect(error).toBeNull();
      expect(["#111111", "#222222"]).toContain(data);
    });
  });

  describe("teachers", () => {
    it("an admin creates a teacher with several lesson types", async () => {
      const second = await admin
        .from("lesson_types")
        .insert({ name: `${PREFIX} גיטרה`, default_duration_minutes: 30, color: "#34D399" })
        .select("id")
        .single();

      const { data, error } = await admin.rpc("save_teacher", {
        p_id: null as unknown as string,
        p_full_name: "מורה RLS",
        p_email: `${PREFIX}-teacher@example.test`,
        p_phone: "050-1234567",
        p_lesson_type_ids: [lessonTypeId, second.data!.id],
      });
      expect(error).toBeNull();
      teacherId = data!;

      const { data: skills } = await admin.from("teacher_skills").select("lesson_type_id").eq("teacher_id", teacherId);
      expect(skills).toHaveLength(2);

      // Updating replaces the set of lesson types.
      const { error: updateError } = await admin.rpc("save_teacher", {
        p_id: teacherId,
        p_full_name: "מורה RLS מעודכן",
        p_email: `${PREFIX}-teacher@example.test`,
        p_phone: "",
        p_lesson_type_ids: [lessonTypeId],
      });
      expect(updateError).toBeNull();
      const { data: after } = await admin.from("teacher_skills").select("lesson_type_id").eq("teacher_id", teacherId);
      expect(after).toHaveLength(1);
    });

    it("a teacher must have at least one lesson type", async () => {
      const { error } = await admin.rpc("save_teacher", {
        p_id: teacherId,
        p_full_name: "מורה RLS",
        p_email: `${PREFIX}-teacher@example.test`,
        p_phone: "",
        p_lesson_type_ids: [],
      });
      expect(error?.message).toBe("skills_required");
    });

    it("a duplicate email is rejected", async () => {
      const { error } = await admin.rpc("save_teacher", {
        p_id: null as unknown as string,
        p_full_name: "כפול",
        p_email: users!.admin.email,
        p_phone: "",
        p_lesson_type_ids: [lessonTypeId],
      });
      expect(error?.message).toBe("email_taken");
    });

    it("a lesson type taught by a teacher cannot be deleted", async () => {
      const { error } = await admin.from("lesson_types").delete().eq("id", lessonTypeId);
      expect(error?.code).toBe("23503");
    });

    it("a teacher sees only their own teacher row and skills", async () => {
      const { data } = await teacher.from("teachers").select("profile_id");
      expect(data!.map((r) => r.profile_id)).toEqual([users!.teacher.id]);
      const { data: skills } = await teacher.from("teacher_skills").select("teacher_id");
      expect(new Set(skills!.map((s) => s.teacher_id)).size).toBe(1);
    });

    it("an inactive teacher still sees their own row", async () => {
      const { data } = await teacherInactive.from("teachers").select("profile_id");
      expect(data!.map((r) => r.profile_id)).toEqual([users!.teacherInactive.id]);
    });

    it("a teacher cannot call admin RPCs", async () => {
      const calls = await Promise.all([
        teacher.rpc("save_teacher", {
          p_id: null as unknown as string,
          p_full_name: "x",
          p_email: `${PREFIX}-x@example.test`,
          p_phone: "",
          p_lesson_type_ids: [lessonTypeId],
        }),
        teacher.rpc("set_teacher_status", { p_teacher_id: teacherId, p_status: "inactive" }),
        teacher.rpc("create_invitation", {
          p_role: "teacher",
          p_teacher_id: teacherId,
          p_full_name: "",
          p_email: "",
          p_token_hash: tokenHash(),
        }),
        teacher.rpc("set_admin_status", { p_profile_id: users!.admin.id, p_status: "inactive" }),
        teacher.rpc("transfer_super_admin", { p_target_profile_id: users!.teacher.id }),
        teacher.rpc("list_open_invitations"),
      ]);
      for (const { error } of calls) expect(error).not.toBeNull();
    });

    it("status changes are applied by admins", async () => {
      const { error } = await admin.rpc("set_teacher_status", { p_teacher_id: teacherId, p_status: "inactive" });
      expect(error).toBeNull();
      const { data } = await admin.from("teachers").select("status").eq("id", teacherId).single();
      expect(data!.status).toBe("inactive");
      await admin.rpc("set_teacher_status", { p_teacher_id: teacherId, p_status: "active" });
    });
  });

  describe("invitations", () => {
    it("clients cannot read the invitations table", async () => {
      const { data } = await superAdmin.from("invitations").select("id");
      expect(data ?? []).toHaveLength(0);
    });

    it("a regular admin cannot invite an admin", async () => {
      const { error } = await admin.rpc("create_invitation", {
        p_role: "admin",
        p_teacher_id: null as unknown as string,
        p_full_name: "מנהל",
        p_email: `${PREFIX}-admin@example.test`,
        p_token_hash: tokenHash(),
      });
      expect(error?.message).toBe("not_allowed");
    });

    it("signed-in users cannot accept an invitation themselves", async () => {
      const { error } = await teacher.rpc("accept_invitation", {
        p_token_hash: tokenHash(),
        p_user_id: users!.teacher.id,
      });
      expect(error).not.toBeNull();
    });

    it("a teacher invitation always creates a teacher account, once", async () => {
      const hash = tokenHash();
      const { error } = await admin.rpc("create_invitation", {
        p_role: "teacher",
        p_teacher_id: teacherId,
        p_full_name: "ignored",
        p_email: "ignored@example.test",
        p_token_hash: hash,
      });
      expect(error).toBeNull();

      const { data: open } = await admin.rpc("list_open_invitations");
      expect(open!.some((i) => i.teacher_id === teacherId && i.role === "teacher")).toBe(true);

      const { data: created } = await service.auth.admin.createUser({
        email: `${PREFIX}-teacher@example.test`,
        password: randomBytes(18).toString("base64url"),
        email_confirm: true,
      });
      createdAuthUsers.push(created.user!.id);

      // Two concurrent accepts: exactly one succeeds.
      const results = await Promise.all([
        service.rpc("accept_invitation", { p_token_hash: hash, p_user_id: created.user!.id }),
        service.rpc("accept_invitation", { p_token_hash: hash, p_user_id: created.user!.id }),
      ]);
      const ok = results.filter((r) => !r.error);
      expect(ok).toHaveLength(1);
      expect(ok[0].data).toBe("teacher");

      const { data: profile } = await service.from("profiles").select("role").eq("id", created.user!.id).single();
      expect(profile!.role).toBe("teacher");
      const { data: linked } = await service.from("teachers").select("profile_id").eq("id", teacherId).single();
      expect(linked!.profile_id).toBe(created.user!.id);
    });

    it("expired and revoked invitations are rejected", async () => {
      const revokedHash = tokenHash();
      await superAdmin.rpc("create_invitation", {
        p_role: "admin",
        p_teacher_id: null as unknown as string,
        p_full_name: "מנהל מבוטל",
        p_email: `${PREFIX}-revoked@example.test`,
        p_token_hash: revokedHash,
      });
      const { data: open } = await superAdmin.rpc("list_open_invitations");
      const invitation = open!.find((i) => i.email === `${PREFIX}-revoked@example.test`)!;
      expect((await superAdmin.rpc("revoke_invitation", { p_invitation_id: invitation.id })).error).toBeNull();

      const expiredHash = tokenHash();
      await superAdmin.rpc("create_invitation", {
        p_role: "admin",
        p_teacher_id: null as unknown as string,
        p_full_name: "מנהל פג",
        p_email: `${PREFIX}-expired@example.test`,
        p_token_hash: expiredHash,
      });
      await service.from("invitations").update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq("token_hash", expiredHash);

      for (const hash of [revokedHash, expiredHash]) {
        const { error } = await service.rpc("accept_invitation", {
          p_token_hash: hash,
          p_user_id: users!.noProfile.id,
        });
        expect(error?.message).toBe("invitation_invalid");
      }
    });
  });

  describe("admin management", () => {
    it("only the Super Admin can deactivate an admin and change permissions", async () => {
      expect((await admin.rpc("set_admin_status", { p_profile_id: users!.admin2.id, p_status: "inactive" })).error)
        .not.toBeNull();
      expect(
        (await admin.rpc("set_admin_permissions", { p_profile_id: users!.admin2.id, p_delete_student_history: true }))
          .error,
      ).not.toBeNull();

      expect((await superAdmin.rpc("set_admin_status", { p_profile_id: users!.admin2.id, p_status: "inactive" })).error)
        .toBeNull();
      expect((await superAdmin.rpc("set_admin_status", { p_profile_id: users!.admin2.id, p_status: "active" })).error)
        .toBeNull();

      expect(
        (await superAdmin.rpc("set_admin_permissions", {
          p_profile_id: users!.admin2.id,
          p_delete_student_history: true,
        })).error,
      ).toBeNull();
      const { data } = await superAdmin
        .from("admin_permissions")
        .select("delete_student_history")
        .eq("profile_id", users!.admin2.id)
        .single();
      expect(data!.delete_student_history).toBe(true);
      await superAdmin.rpc("set_admin_permissions", { p_profile_id: users!.admin2.id, p_delete_student_history: false });
    });

    it("an admin cannot read other admins' permissions", async () => {
      const { data } = await admin.from("admin_permissions").select("profile_id");
      expect((data ?? []).every((r) => r.profile_id === users!.admin.id)).toBe(true);
    });

    it("the Super Admin cannot deactivate themselves", async () => {
      const { error } = await superAdmin.rpc("set_admin_status", {
        p_profile_id: users!.superAdmin.id,
        p_status: "inactive",
      });
      expect(error).not.toBeNull();
    });

    it("the Super Admin role can be transferred and transferred back", async () => {
      expect((await superAdmin.rpc("transfer_super_admin", { p_target_profile_id: users!.admin2.id })).error).toBeNull();
      const { data: roles } = await service
        .from("profiles")
        .select("id, role")
        .in("id", [users!.superAdmin.id, users!.admin2.id]);
      const byId = Object.fromEntries(roles!.map((r) => [r.id, r.role]));
      expect(byId[users!.admin2.id]).toBe("super_admin");
      expect(byId[users!.superAdmin.id]).toBe("admin");

      const admin2 = await signedIn(users!.admin2);
      expect((await admin2.rpc("transfer_super_admin", { p_target_profile_id: users!.superAdmin.id })).error).toBeNull();
      const { data: restored } = await service.from("profiles").select("role").eq("id", users!.superAdmin.id).single();
      expect(restored!.role).toBe("super_admin");
    });

    it("the last active Super Admin cannot be demoted", async () => {
      // Direct update with the secret key still hits the database trigger.
      const { data: supers } = await service
        .from("profiles")
        .select("id")
        .eq("role", "super_admin")
        .eq("status", "active");
      if (supers!.length !== 1) return; // other super admins exist in Development; covered by the trigger test in M1
      const { error } = await service.from("profiles").update({ role: "admin" }).eq("id", supers![0].id);
      expect(error?.message).toContain("last active super admin");
    });
  });

  describe("own profile", () => {
    it("a user edits only name and phone, never role", async () => {
      const { error } = await admin.rpc("update_own_profile", { p_full_name: "מנהל בדיקה", p_phone: "050-0000000" });
      expect(error).toBeNull();
      const { data } = await admin.from("profiles").select("role, phone").eq("id", users!.admin.id).single();
      expect(data!.role).toBe("admin");
      expect(data!.phone).toBe("050-0000000");
    });

    it("an inactive teacher cannot edit their profile", async () => {
      const { error } = await teacherInactive.rpc("update_own_profile", { p_full_name: "שינוי", p_phone: "" });
      expect(error?.message).toBe("not_allowed");
    });

    it("users still cannot update profiles directly", async () => {
      const { data } = await teacher.from("profiles").update({ role: "admin" }).eq("id", users!.teacher.id).select("id");
      expect(data ?? []).toHaveLength(0);
    });
  });
});
