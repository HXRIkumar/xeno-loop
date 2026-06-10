"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Users, Send, BarChart3, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/customers", label: "Customers", icon: Users },
  { href: "/campaigns", label: "Campaigns", icon: Send },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/loop", label: "Loop", icon: Sparkles },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r bg-card/60">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <span className="text-base font-bold">∞</span>
        </div>
        <div className="leading-tight">
          <div className="text-sm font-semibold tracking-tight">Loop</div>
          <div className="text-[11px] text-muted-foreground">StyleArc co-pilot</div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
              {label === "Loop" && (
                <span className="ml-auto rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                  AI
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="px-5 py-4 text-[11px] leading-relaxed text-muted-foreground">
        <p className="font-medium text-foreground/70">Human-in-the-loop</p>
        <p>The agent proposes. You approve. Nothing fires unsupervised.</p>
      </div>
    </aside>
  );
}
