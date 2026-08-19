"use server";

import { redirect } from "next/navigation";
import { addComment, addNote, reassignCase, transitionCase } from "@/features/cases/service";
import { ApiError } from "@/lib/server/api-client";
import type { CaseAction } from "@/lib/api/types";

export interface CaseActionState {
  error?: string;
}

function caseIdOf(formData: FormData): string {
  return String(formData.get("caseId") ?? "");
}

export async function transitionCaseAction(
  _prevState: CaseActionState,
  formData: FormData,
): Promise<CaseActionState> {
  const caseId = caseIdOf(formData);
  const action = String(formData.get("action") ?? "") as CaseAction;
  const resolutionSummary = formData.get("resolutionSummary");

  try {
    await transitionCase(
      caseId,
      action,
      typeof resolutionSummary === "string" && resolutionSummary ? resolutionSummary : undefined,
    );
  } catch (error) {
    if (error instanceof ApiError) {
      return { error: error.message };
    }
    return { error: "Something went wrong. Please try again." };
  }
  redirect(`/cases/${caseId}`);
}

export async function reassignCaseAction(
  _prevState: CaseActionState,
  formData: FormData,
): Promise<CaseActionState> {
  const caseId = caseIdOf(formData);
  const assigneeId = String(formData.get("assigneeId") ?? "");

  if (!assigneeId) {
    return { error: "Choose a user to reassign to." };
  }

  try {
    await reassignCase(caseId, assigneeId);
  } catch (error) {
    if (error instanceof ApiError) {
      return { error: error.message };
    }
    return { error: "Something went wrong. Please try again." };
  }
  redirect(`/cases/${caseId}`);
}

export async function addNoteAction(
  _prevState: CaseActionState,
  formData: FormData,
): Promise<CaseActionState> {
  const caseId = caseIdOf(formData);
  const content = String(formData.get("content") ?? "").trim();

  if (!content) {
    return { error: "Note content is required." };
  }

  try {
    await addNote(caseId, content);
  } catch (error) {
    if (error instanceof ApiError) {
      return { error: error.message };
    }
    return { error: "Something went wrong. Please try again." };
  }
  redirect(`/cases/${caseId}`);
}

export async function addCommentAction(
  _prevState: CaseActionState,
  formData: FormData,
): Promise<CaseActionState> {
  const caseId = caseIdOf(formData);
  const content = String(formData.get("content") ?? "").trim();

  if (!content) {
    return { error: "Comment content is required." };
  }

  try {
    await addComment(caseId, content);
  } catch (error) {
    if (error instanceof ApiError) {
      return { error: error.message };
    }
    return { error: "Something went wrong. Please try again." };
  }
  redirect(`/cases/${caseId}`);
}
