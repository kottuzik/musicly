import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// Public health check used by the daily "Check Site" automation. It proves that the app can reach
// the database with its secret key and read a table. It returns no data and no error details.
// The edge cache absorbs repeated requests so the endpoint cannot be used to hammer the database.
const HEADERS = { "Cache-Control": "public, s-maxage=60" };

export async function GET() {
  try {
    const { error } = await createAdminClient()
      .from("profiles")
      .select("id")
      .limit(1)
      .abortSignal(AbortSignal.timeout(8000));
    if (error) throw error;
    return Response.json({ ok: true }, { headers: HEADERS });
  } catch (error) {
    // Log the cause for the Vercel logs; the response stays generic.
    console.error("health check failed", error);
    return Response.json({ ok: false }, { status: 503, headers: HEADERS });
  }
}
