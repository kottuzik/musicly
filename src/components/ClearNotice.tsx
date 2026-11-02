"use client";

import { useEffect } from "react";

// One-time messages travel in the address as ?notice=...; once shown, the parameter is removed so
// that reloading the page does not show the message again. The message already on screen stays.
export function ClearNotice() {
  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("notice")) return;
    url.searchParams.delete("notice");
    window.history.replaceState(window.history.state, "", url);
  }, []);
  return null;
}
