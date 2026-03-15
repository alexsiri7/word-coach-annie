"use client";

import Link from "next/link";
import { ChevronRight, Home } from "lucide-react";
import { cn } from "@/lib/utils";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  className?: string;
}

export function Breadcrumbs({ items, className }: BreadcrumbsProps) {
  return (
    <nav
      aria-label="Breadcrumb"
      className={cn("flex items-center gap-1 text-xs text-text-muted", className)}
    >
      <Link
        href="/"
        className="flex items-center gap-1 hover:text-text-secondary transition-colors"
      >
        <Home className="h-3 w-3" />
        <span>Home</span>
      </Link>
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1">
          <ChevronRight className="h-3 w-3 flex-shrink-0" />
          {item.href ? (
            <Link
              href={item.href}
              className="hover:text-text-secondary transition-colors truncate max-w-[150px]"
              title={item.label}
            >
              {item.label}
            </Link>
          ) : (
            <span className="text-text-secondary truncate max-w-[150px]" title={item.label}>
              {item.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  );
}
