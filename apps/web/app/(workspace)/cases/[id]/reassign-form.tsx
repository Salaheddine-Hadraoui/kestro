"use client";

import { useActionState } from "react";
import { reassignCaseAction, type CaseActionState } from "./actions";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/form-error";

const initialState: CaseActionState = {};

export function ReassignForm({
  caseId,
  activeUsers,
}: {
  caseId: string;
  activeUsers: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState(reassignCaseAction, initialState);

  return (
    <form action={formAction} className="flex items-end gap-2">
      <input type="hidden" name="caseId" value={caseId} />
      <div className="space-y-1">
        <label htmlFor="reassign-assigneeId" className="block text-sm font-medium">
          Reassign to
        </label>
        <select
          id="reassign-assigneeId"
          name="assigneeId"
          required
          className="rounded-md border border-black/20 px-3 py-2 text-sm dark:border-white/20 dark:bg-transparent"
        >
          <option value="">Choose a user</option>
          {activeUsers.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.name}
            </option>
          ))}
        </select>
      </div>
      {state.error && <FormError message={state.error} />}
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Reassigning…" : "Reassign"}
      </Button>
    </form>
  );
}
