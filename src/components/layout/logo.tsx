import { cn } from "@/lib/cn";

interface LogoProps {
  className?: string;
}

export function Logo({ className }: LogoProps) {
  return (
    <span
      aria-label="WrenPass"
      className={cn("block h-9 w-[3.375rem] shrink-0 bg-no-repeat", className)}
      role="img"
      style={{
        backgroundImage: 'url("/logo.png")',
        backgroundPosition: "center 46.8%",
        backgroundSize: "175% auto",
      }}
    />
  );
}
