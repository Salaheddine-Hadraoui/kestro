import type { ElementType, ReactNode } from "react";

// Border/rounded box shared by every "list item" and "callout" surface
// (linked alerts, notes/comments, resolution summary). No padding is baked
// in -- Tailwind resolves same-specificity utility class conflicts by
// declaration order in the generated stylesheet, not by className string
// order, so a caller-supplied padding class could silently lose to a
// baked-in one. Callers always supply their own p-* class instead.
export function Card({
  as: Component = "div",
  className = "",
  children,
}: {
  as?: ElementType;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Component className={`rounded-md border border-black/10 text-sm dark:border-white/10 ${className}`}>
      {children}
    </Component>
  );
}
