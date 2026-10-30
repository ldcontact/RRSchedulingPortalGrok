"use client";
import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";

export function SubmitButton({ children, className = "btn btn-primary", pendingText = "Saving…", ...rest }: { children: ReactNode; className?: string; pendingText?: string; name?: string; value?: string; formAction?: (fd: FormData) => void }) {
  const { pending } = useFormStatus();
  return <button type="submit" className={className} disabled={pending} {...rest}>{pending ? pendingText : children}</button>;
}
