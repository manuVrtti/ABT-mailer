"use client";

import { SessionProvider } from "next-auth/react";
import { OverlayHost } from "@/components/overlay";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      {children}
      <OverlayHost />
    </SessionProvider>
  );
}
