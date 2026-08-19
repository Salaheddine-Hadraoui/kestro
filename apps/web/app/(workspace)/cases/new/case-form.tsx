"use client";

import { useActionState } from "react";
import { createCaseAction, type CaseFormState } from "./actions";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { FormError } from "@/components/ui/form-error";
import type { UserRole } from "@/lib/api/types";

const initialState: CaseFormState = {};

export function CaseForm({
  role,
  activeUsers,
}: {
  role: UserRole;
  activeUsers: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState(createCaseAction, initialState);

  return (
    <form action={formAction} className="max-w-md space-y-4">
      <TextField label="Title" name="title" required maxLength={200} />
      <div className="space-y-1">
        <label htmlFor="severity" className="block text-sm font-medium">
          Severity
        </label>
        <select
          id="severity"
          name="severity"
          required
          className="w-full rounded-md border border-black/20 px-3 py-2 text-sm dark:border-white/20 dark:bg-transparent"
        >
          <option value="">Select severity</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="critical">Critical</option>
        </select>
      </div>
      {role === "lead" && (
        <div className="space-y-1">
          <label htmlFor="assigneeId" className="block text-sm font-medium">
            Assign to
          </label>
          <select
            id="assigneeId"
            name="assigneeId"
            className="w-full rounded-md border border-black/20 px-3 py-2 text-sm dark:border-white/20 dark:bg-transparent"
          >
            <option value="">Myself</option>
            {activeUsers.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.name}
              </option>
            ))}
          </select>
        </div>
      )}
      {state.error && <FormError message={state.error} />}
      <Button type="submit" disabled={pending}>
        {pending ? "Creating…" : "Create case"}
      </Button>
    </form>
  );
}
