"use client";

import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

function getPageNumbers(currentPage: number, totalPages: number): (number | "ellipsis")[] {
  if (totalPages <= 1) return [];
  const pages: (number | "ellipsis")[] = [];
  const maxVisible = 5;

  if (totalPages <= maxVisible) {
    for (let i = 0; i < totalPages; i++) pages.push(i);
    return pages;
  }

  pages.push(0);
  if (currentPage > 2) pages.push("ellipsis");

  const start = Math.max(1, currentPage - 1);
  const end = Math.min(totalPages - 2, currentPage + 1);
  for (let i = start; i <= end; i++) pages.push(i);

  if (currentPage < totalPages - 3) pages.push("ellipsis");
  pages.push(totalPages - 1);

  return pages;
}

export interface VisionListPaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  from: number;
  to: number;
  total: number;
  renderShowing: (from: number, to: number, total: number) => React.ReactNode;
  previousLabel: string;
  nextLabel: string;
}

export function VisionListPagination({
  currentPage,
  totalPages,
  onPageChange,
  from,
  to,
  total,
  renderShowing,
  previousLabel,
  nextLabel,
}: VisionListPaginationProps) {
  const pages = getPageNumbers(currentPage, totalPages);

  return (
    <div className="border-t border-border p-3 flex flex-wrap items-center justify-between gap-4 bg-muted/30">
      <div className="text-xs text-muted-foreground hidden sm:block">
        {renderShowing(from, to, total)}
      </div>
      <div className="flex items-center gap-1.5 mx-auto sm:mx-0">
        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 0}
          aria-label={previousLabel}
          title={previousLabel}
        >
          <ChevronLeft />
        </Button>
        {pages.map((pageNum, index) => {
          if (pageNum === "ellipsis") {
            return (
              <span
                key={`ellipsis-${index}`}
                className="text-muted-foreground text-xs px-1"
                aria-hidden
              >
                …
              </span>
            );
          }
          const isActive = pageNum === currentPage;
          return (
            <Button
              key={pageNum}
              variant={isActive ? "default" : "ghost"}
              size="icon-sm"
              className="text-xs tabular-nums"
              aria-current={isActive ? "page" : undefined}
              onClick={() => onPageChange(pageNum)}
            >
              {pageNum + 1}
            </Button>
          );
        })}
        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages - 1}
          aria-label={nextLabel}
          title={nextLabel}
        >
          <ChevronRight />
        </Button>
      </div>
    </div>
  );
}
