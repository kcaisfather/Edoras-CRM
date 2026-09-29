"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

const Pagination = ({ className, ...props }: React.ComponentProps<"nav">) => {
  const tCommon = useTranslations("common")
  return (
    <nav
      aria-label={tCommon("pagination")}
      className={cn("mx-auto flex w-full justify-center", className)}
      {...props}
    />
  )
}
Pagination.displayName = "Pagination"

const PaginationContent = React.forwardRef<
  HTMLUListElement,
  React.ComponentProps<"ul">
>(({ className, ...props }, ref) => (
  <ul
    ref={ref}
    className={cn("flex flex-row items-center gap-1", className)}
    {...props}
  />
))
PaginationContent.displayName = "PaginationContent"

const PaginationItem = React.forwardRef<
  HTMLLIElement,
  React.ComponentProps<"li">
>(({ className, ...props }, ref) => (
  <li ref={ref} className={cn("", className)} {...props} />
))
PaginationItem.displayName = "PaginationItem"

type PaginationLinkProps = {
  isActive?: boolean
} & React.ComponentProps<typeof Button>

/** Sayfa numarası: aktif = default (primary), diğerleri ghost; VisionListPagination ile aynı. */
const PaginationLink = ({
  className,
  isActive,
  size = "icon-sm",
  variant,
  ...props
}: PaginationLinkProps) => (
  <Button
    aria-current={isActive ? "page" : undefined}
    variant={variant ?? (isActive ? "default" : "ghost")}
    size={size}
    className={cn(isActive && "pointer-events-none", className)}
    {...props}
  />
)
PaginationLink.displayName = "PaginationLink"

interface PaginationPreviousProps extends React.ComponentProps<typeof PaginationLink> {
  label?: string;
}

const PaginationPrevious = ({
  className,
  label,
  ...props
}: PaginationPreviousProps) => {
  const tCommon = useTranslations("common")
  return (
    <PaginationLink
      variant="outline"
      size="sm"
      className={className}
      {...props}
    >
      <ChevronLeft />
      <span>{label ?? tCommon("previous")}</span>
    </PaginationLink>
  )
}
PaginationPrevious.displayName = "PaginationPrevious"

interface PaginationNextProps extends React.ComponentProps<typeof PaginationLink> {
  label?: string;
}

const PaginationNext = ({
  className,
  label,
  ...props
}: PaginationNextProps) => {
  const tCommon = useTranslations("common")
  return (
    <PaginationLink
      variant="outline"
      size="sm"
      className={className}
      {...props}
    >
      <span>{label ?? tCommon("next")}</span>
      <ChevronRight />
    </PaginationLink>
  )
}
PaginationNext.displayName = "PaginationNext"

const PaginationEllipsis = ({
  className,
  ...props
}: React.ComponentProps<"span">) => (
  <span
    aria-hidden
    className={cn("flex h-8 w-8 items-center justify-center text-muted-foreground", className)}
    {...props}
  >
    <MoreHorizontal className="h-4 w-4" />
  </span>
)
PaginationEllipsis.displayName = "PaginationEllipsis"

export {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
}
