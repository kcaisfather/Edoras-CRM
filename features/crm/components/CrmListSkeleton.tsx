"use client";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

const COLUMNS = 7;

export function CrmListSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/60">
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              {Array.from({ length: COLUMNS }).map((_, j) => (
                <TableHead key={j}>
                  <Skeleton className="h-4 w-16" />
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>
                {Array.from({ length: COLUMNS }).map((_, j) => (
                  <TableCell key={j}>
                    <Skeleton className="h-4 w-full max-w-[120px]" />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="space-y-3 p-3 md:hidden">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border bg-background/60 p-4">
            <Skeleton className="mb-3 h-5 w-32" />
            <Skeleton className="mb-2 h-4 w-48" />
            <Skeleton className="h-4 w-40" />
          </div>
        ))}
      </div>
    </div>
  );
}
