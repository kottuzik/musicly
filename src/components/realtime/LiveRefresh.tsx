"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

// Re-renders the page's server data when one of the tables changes (Supabase Realtime,
// filtered by RLS). Realtime only triggers a refresh; the data itself is read again on the server.
export function LiveRefresh({ tables }: { tables: string[] }) {
  const router = useRouter();
  const key = tables.join(",");

  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 300);
    };

    const channel = supabase.channel(`live:${key}:${Math.random().toString(36).slice(2)}`);
    for (const table of key.split(",")) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, refresh);
    }
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) supabase.realtime.setAuth(data.session.access_token);
      // Changes made before the channel joined (or while offline) sent no event: catch up once connected.
      channel.subscribe((status) => {
        if (status === "SUBSCRIBED") refresh();
      });
    });

    return () => {
      clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [key, router]);

  return null;
}
