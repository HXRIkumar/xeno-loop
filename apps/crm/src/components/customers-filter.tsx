"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PERSONAS, PERSONA_LABEL } from "@/lib/display";

export function CustomersFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  const [q, setQ] = useState(params.get("q") ?? "");
  const persona = params.get("persona") ?? "ALL";

  // push URL state when filters change; debounce the text query
  function apply(next: { q?: string; persona?: string }) {
    const sp = new URLSearchParams(params.toString());
    const nextQ = next.q ?? q;
    const nextPersona = next.persona ?? persona;
    if (nextQ) sp.set("q", nextQ);
    else sp.delete("q");
    if (nextPersona && nextPersona !== "ALL") sp.set("persona", nextPersona);
    else sp.delete("persona");
    startTransition(() => router.replace(`${pathname}?${sp.toString()}`));
  }

  useEffect(() => {
    const t = setTimeout(() => apply({ q }), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <div className="relative w-full sm:w-72">
        <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name or email…"
          className="pl-8"
        />
      </div>
      <Select value={persona} onValueChange={(v) => apply({ persona: v })}>
        <SelectTrigger className="w-full sm:w-52">
          <SelectValue placeholder="All personas" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">All personas</SelectItem>
          {PERSONAS.map((p) => (
            <SelectItem key={p} value={p}>
              {PERSONA_LABEL[p]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
