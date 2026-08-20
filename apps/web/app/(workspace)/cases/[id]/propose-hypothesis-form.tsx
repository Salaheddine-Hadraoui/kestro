"use client";

import { useActionState } from "react";
import { proposeHypothesisAction, type CaseActionState } from "./actions";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/form-error";

const initialState: CaseActionState = {};

export function ProposeHypothesisForm({ caseId }: { caseId: string }) {
  const [state, formAction, pending] = useActionState(proposeHypothesisAction, initialState);

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="caseId" value={caseId} />
      <div className="space-y-1">
        <label htmlFor={`hypothesis-statement-${caseId}`} className="block text-sm font-medium">
          Propose a hypothesis
        </label>
        <textarea
          id={`hypothesis-statement-${caseId}`}
          name="statement"
          required
          maxLength={2000}
          className="w-full rounded-md border border-black/20 px-3 py-2 text-sm dark:border-white/20 dark:bg-transparent"
        />
      </div>
      {state.error && <FormError message={state.error} />}
      <Button type="submit" disabled={pending}>
        {pending ? "Proposing…" : "Propose hypothesis"}
      </Button>
    </form>
  );
}
