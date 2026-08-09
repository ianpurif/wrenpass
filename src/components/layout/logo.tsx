import { Bird } from "lucide-react";

import { cn } from "@/lib/cn";

interface LogoProps {
  className?: string;
  compact?: boolean;
}

export function Logo({ className, compact = false }: LogoProps) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <span className="grid size-9 place-items-center rounded-xl bg-forest text-white shadow-button">
        <Bird aria-hidden="true" className="size-5" strokeWidth={2.2} />
      </span>
      {!compact && <span className="text-lg font-extrabold tracking-tight text-ink">WrenPass</span>}
    </span>
  );
}

