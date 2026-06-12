"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Sparkles, X } from "lucide-react";
import { ChatPanel } from "@/components/chat-panel";
import { cn } from "@/lib/utils";

/** A floating Loop chat widget available on every page (hidden on the full /loop page). */
export function FloatingLoop() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  if (pathname.startsWith("/loop")) return null;

  return (
    <>
      {open && (
        <div
          style={{
            bottom: "calc(max(1.25rem, env(safe-area-inset-bottom)) + 4.25rem)",
            right: "max(1.25rem, env(safe-area-inset-right))",
          }}
          className="fixed z-50 flex h-[560px] max-h-[calc(100dvh-7rem)] w-[400px] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl"
        >
          <div className="flex items-center justify-between border-b bg-primary/[0.04] px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-primary">
              <Sparkles className="h-4 w-4" /> Loop
            </div>
            <button
              onClick={() => setOpen(false)}
              className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="min-h-0 flex-1">
            <ChatPanel />
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          bottom: "max(1.25rem, env(safe-area-inset-bottom))",
          right: "max(1.25rem, env(safe-area-inset-right))",
        }}
        className={cn(
          "fixed z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105"
        )}
        aria-label="Open Loop"
      >
        {open ? <X className="h-6 w-6" /> : <Sparkles className="h-6 w-6" />}
      </button>
    </>
  );
}
