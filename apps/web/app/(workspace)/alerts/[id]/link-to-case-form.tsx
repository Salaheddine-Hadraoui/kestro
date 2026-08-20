"use client";

import { useActionState } from "react";
import { linkAlertToCaseAction, type AlertActionState } from "./actions";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/form-error";

const initialState: AlertActionState = {};

export function LinkToCaseForm({
  alertId,
  cases,
}: {
  alertId: string;
  cases: { id: string; title: string }[];
}) {
  const [state, formAction, pending] = useActionState(linkAlertToCaseAction, initialState);

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="alertId" value={alertId} />
      <div className="space-y-1">
        <label htmlFor={`link-caseId-${alertId}`} className="block text-sm font-medium">
          Link to an existing case
        </label>
        <select
          id={`link-caseId-${alertId}`}
          name="caseId"
          required
          className="w-full rounded-md border border-black/20 px-3 py-2 text-sm dark:border-white/20 dark:bg-transparent"
        >
          <option value="">Choose a case</option>
          {cases.map((kase) => (
            <option key={kase.id} value={kase.id}>
              {kase.title}
            </option>
          ))}
        </select>
      </div>
      {state.error && <FormError message={state.error} />}
      <Button type="submit" variant="secondary" disabled={pending || cases.length === 0}>
        {pending ? "Linking…" : "Link to case"}
      </Button>
    </form>
  );
}
