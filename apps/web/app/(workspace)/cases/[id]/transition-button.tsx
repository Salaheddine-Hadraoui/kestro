"use client";

import { useActionState } from "react";
import { transitionCaseAction, type CaseActionState } from "./actions";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/form-error";
import type { CaseTransitionRule } from "@/lib/case-transitions";

const initialState: CaseActionState = {};

const ACTION_LABELS: Record<CaseTransitionRule["action"], string> = {
  begin_triage: "Begin triage",
  start_investigation: "Start investigation",
  escalate: "Escalate",
  accept_escalation: "Accept escalation",
  begin_mitigation: "Begin mitigation",
  begin_verification: "Begin verification",
  resolve: "Resolve",
  reopen: "Reopen",
};

export function TransitionButton({
  caseId,
  rule,
}: {
  caseId: string;
  rule: CaseTransitionRule;
}) {
  const [state, formAction, pending] = useActionState(transitionCaseAction, initialState);

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="caseId" value={caseId} />
      <input type="hidden" name="action" value={rule.action} />
      {rule.requiresResolutionSummary && (
        <div className="space-y-1">
          <label htmlFor={`resolutionSummary-${rule.action}`} className="block text-sm font-medium">
            Resolution summary
          </label>
          <textarea
            id={`resolutionSummary-${rule.action}`}
            name="resolutionSummary"
            required
            maxLength={2000}
            className="w-full rounded-md border border-black/20 px-3 py-2 text-sm dark:border-white/20 dark:bg-transparent"
          />
        </div>
      )}
      {state.error && <FormError message={state.error} />}
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Working…" : ACTION_LABELS[rule.action]}
      </Button>
    </form>
  );
}
