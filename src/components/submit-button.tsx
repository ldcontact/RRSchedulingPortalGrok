"use client";
import { useFormStatus } from "react-dom";
import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Spinner } from "./spinner";
import { useOptionalNavProgress } from "./nav-progress";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  pendingText?: string;
  formAction?: ((fd: FormData) => void) | string;
};

export function SubmitButton({ children, className = "btn btn-primary", pendingText = "Saving…", ...rest }: Props) {
  const { pending } = useFormStatus();
  const nav = useOptionalNavProgress();
  const wasPending = useRef(false);
  useEffect(() => {
    if (pending && !wasPending.current) nav?.start();
    if (!pending && wasPending.current) nav?.done();
    wasPending.current = pending;
  }, [pending, nav]);
  return (
    <button type="submit" {...rest} className={`${className}${pending ? " btn-pending" : ""}`} disabled={pending} aria-busy={pending}>
      {pending ? <><Spinner />{pendingText}</> : children}
    </button>
  );
}
