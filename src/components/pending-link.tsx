"use client";

import Link from "next/link";
import { useLinkStatus } from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { useNavPendingHref } from "./nav-progress";
import { Spinner } from "./spinner";

function destPath(href: ComponentProps<typeof Link>["href"]): string {
  if (typeof href === "string") {
    try {
      const u = new URL(href, typeof window === "undefined" ? "http://local.invalid" : window.location.origin);
      return u.pathname + u.search;
    } catch {
      return href;
    }
  }
  const path = href.pathname ?? "";
  const search = href.search ?? "";
  return path + search;
}

function PendingLinkStatus({ href, pendingText, children }: { href: ComponentProps<typeof Link>["href"]; pendingText: string; children: ReactNode }) {
  const { pending } = useLinkStatus();
  const pendingHref = useNavPendingHref();
  const show = pending || (pendingHref !== null && pendingHref === destPath(href));
  if (!show) return children;
  return <><Spinner />{pendingText}</>;
}

/** In-app link that swaps its label for a spinner + Opening… while navigation is in flight. */
export function PendingLink({
  pendingText = "Opening…",
  children,
  className,
  ...rest
}: ComponentProps<typeof Link> & { pendingText?: string }) {
  const pendingClass = className ? `${className}` : undefined;
  return (
    <Link className={pendingClass} {...rest}>
      <PendingLinkStatus href={rest.href} pendingText={pendingText}>
        {children}
      </PendingLinkStatus>
    </Link>
  );
}
