"use server";

import { redirect } from "next/navigation";
import { createCase } from "@/features/cases/service";
import { ApiError } from "@/lib/server/api-client";
import type { Severity } from "@/lib/api/types";

export interface CaseFormState {
  error?: string;
}

export async function createCaseAction(
  _prevState: CaseFormState,
  formData: FormData,
): Promise<CaseFormState> {
  const title = String(formData.get("title") ?? "").trim();
  const severity = String(formData.get("severity") ?? "") as Severity;
  const assigneeId = formData.get("assigneeId");
  const alertIds = formData.getAll("alertIds").map((value) => String(value));

  if (!title) {
    return { error: "Title is required." };
  }
  if (!["low", "medium", "high", "critical"].includes(severity)) {
    return { error: "Severity is required." };
  }

  let created;
  try {
    created = await createCase({
      title,
      severity,
      assigneeId: typeof assigneeId === "string" && assigneeId ? assigneeId : undefined,
      alertIds: alertIds.length > 0 ? alertIds : undefined,
    });
  } catch (error) {
    if (error instanceof ApiError) {
      return { error: error.message };
    }
    return { error: "Something went wrong. Please try again." };
  }

  redirect(`/cases/${created.id}`);
}
