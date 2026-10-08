"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const KEY = "abt-mailer:logs-live";
const SECONDS = 10;

/**
 * Live switch for the Logs pages: while on (the default) and the tab is
 * visible, the server component re-fetches every few seconds so new events
 * appear on their own. The choice is remembered per browser.
 */
export function LiveToggle() {
  const router = useRouter();
  const [live, setLive] = useState(true);
  const [updated, setUpdated] = useState<Date | null>(null);

  useEffect(() => {
    try {
      if (localStorage.getItem(KEY) === "off") setLive(false);
    } catch {
      // storage blocked: stay live
    }
    setUpdated(new Date());
  }, []);

  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      router.refresh();
      setUpdated(new Date());
    }, SECONDS * 1000);
    return () => clearInterval(id);
  }, [live, router]);

  function toggle() {
    const next = !live;
    setLive(next);
    try {
      localStorage.setItem(KEY, next ? "on" : "off");
    } catch {
      // ignore
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800/50"
      title={live ? `Updating every ${SECONDS} seconds — click to pause` : "Paused — click to go live"}
    >
      <span className={`relative flex h-2 w-2 ${live ? "" : "opacity-40"}`}>
        {live && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${live ? "bg-emerald-500" : "bg-slate-400"}`} />
      </span>
      {live ? "Live" : "Paused"}
      {updated && (
        <span className="font-normal text-muted-foreground">
          · {updated.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", second: "2-digit" })}
        </span>
      )}
    </button>
  );
}
