import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "warning";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    "bg-black text-white hover:bg-black/80 dark:bg-white dark:text-black dark:hover:bg-white/80",
  secondary:
    "border border-black/20 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10",
  // Reserved for actions that raise a case's urgency or override normal
  // flow (escalate, reopen) -- deliberately not used for routine forward
  // transitions.
  warning: "bg-amber-600 text-white hover:bg-amber-600/85 dark:bg-amber-500 dark:hover:bg-amber-500/85",
};

export function Button({ variant = "primary", className = "", ...props }: ButtonProps) {
  return (
    <button
      className={`rounded-md px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT_CLASSES[variant]} ${className}`}
      {...props}
    />
  );
}
