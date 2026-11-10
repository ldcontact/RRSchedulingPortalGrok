import type { ReactNode } from "react";
import { Icon } from "./icons";
import { BrandMark, Logo } from "./ui";

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen md:grid-cols-[1.1fr_1fr]">
      <div className="relative flex flex-col justify-between overflow-hidden bg-[radial-gradient(circle_at_20%_20%,rgba(245,158,11,.25),transparent_40%),linear-gradient(150deg,var(--color-brand-950),var(--color-brand)_120%)] p-6 text-white md:p-12">
        <div><Logo dark /></div>
        <div className="mt-6 md:my-10">
          <h2 className="max-w-[460px] text-2xl leading-tight font-semibold tracking-tight md:text-[34px]">Schedule crews, track retrofits, and close out ComEd jobs in one place.</h2>
          <ul className="mt-6 hidden flex-col gap-3 text-[#cde5e1] md:flex">
            {[["calendar", "Dispatch board for every tech and crew"], ["users", "Customers, projects and proposed timelines"], ["shield", "Invite-only access: Admin, Manager, Field Tech"]].map(([i, t]) => (
              <li key={t} className="flex items-center gap-2.5"><Icon name={i} className="size-[18px] text-accent" />{t}</li>
            ))}
          </ul>
        </div>
        <div className="hidden text-sm text-[#9cc4bd] md:block">Lighting & HVAC retrofits for ComEd small business customers</div>
      </div>
      <div className="relative flex items-start justify-center bg-white p-6 md:items-center md:p-8">
        <div className="absolute top-4 right-4 md:top-6 md:right-6">
          <BrandMark className="h-8 w-auto max-w-[130px] md:h-9 md:max-w-[150px]" />
        </div>
        <div className="flex w-full max-w-[380px] flex-col gap-5 pt-10 md:pt-0">{children}</div>
      </div>
    </div>
  );
}
