import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

/** Bir listenin neyi kapsadığını dürüstçe söyleyen tek satırlık soluk not. */
export function CoverageNote({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn("flex items-center gap-1.5 text-xs text-muted-foreground", className)}>
      <Info className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}
