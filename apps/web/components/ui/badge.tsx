import type { ReactNode } from "react";

// Generic tone vocabulary shared by every future domain badge (Alerts,
// Investigation/Hypothesis status, Evidence type, ...) -- this file knows
// nothing about Cases specifically. Domain-to-tone mappings live in
// lib/badge-tones.ts.
export type BadgeTone = "neutral" | "blue" | "amber" | "red" | "green" | "purple" | "cyan";

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: "bg-black/10 text-black/70 dark:bg-white/15 dark:text-white/70",
  blue: "bg-blue-600/15 text-blue-800 dark:bg-blue-400/20 dark:text-blue-300",
  amber: "bg-amber-500/15 text-amber-800 dark:bg-amber-400/20 dark:text-amber-300",
  red: "bg-red-600/15 text-red-800 dark:bg-red-400/20 dark:text-red-300",
  green: "bg-green-600/15 text-green-800 dark:bg-green-400/20 dark:text-green-300",
  purple: "bg-purple-600/15 text-purple-800 dark:bg-purple-400/20 dark:text-purple-300",
  cyan: "bg-cyan-600/15 text-cyan-800 dark:bg-cyan-400/20 dark:text-cyan-300",
};

export function Badge({
  tone,
  children,
  className = "",
}: {
  tone: BadgeTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TONE_CLASSES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
