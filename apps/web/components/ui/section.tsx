import type { ReactNode } from "react";

// Repeated "uppercase label heading + content" grouping used for each block
// on the case detail page (Linked alerts, Actions, Notes & Comments) --
// extracted so a future Investigation/Evidence detail page reuses the same
// heading treatment instead of re-typing the className string.
export function Section({
  title,
  children,
  className = "space-y-3",
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={className}>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-black/60 dark:text-white/60">
        {title}
      </h2>
      {children}
    </section>
  );
}
