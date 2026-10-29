import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth/session";
import { homePathForRole } from "@/lib/auth/roles";

// Entry point: send each user to the home screen of their role.
export default async function RootPage({ searchParams }: PageProps<"/">) {
  const profile = await requireProfile();
  const { notice } = await searchParams;
  const query = typeof notice === "string" ? `?notice=${encodeURIComponent(notice)}` : "";
  redirect(`${homePathForRole(profile.role)}${query}`);
}
