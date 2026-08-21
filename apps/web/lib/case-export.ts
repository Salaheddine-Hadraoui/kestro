import type { CaseWithAlerts, Evidence, Hypothesis, PublicUser } from "./api/types";
import type { HumanEntry } from "./case-notes";
import { resolveUserName } from "./format-user";

export interface CaseExportInput {
  kase: CaseWithAlerts;
  userNames: Map<string, PublicUser>;
  hypotheses: Hypothesis[];
  evidence: Evidence[];
  notesAndComments: HumanEntry[];
  exportedAt: string;
  timelineTotal: number;
}

// Renders the same human-readable facts the case detail page shows --
// never the raw internal TimelineEventType log (status_change/
// alert_linked/evidence_added) -- per this milestone's explicit
// requirement not to expose internal implementation events.
export function renderCaseExport(input: CaseExportInput): string {
  const { kase, userNames, hypotheses, evidence, notesAndComments, exportedAt, timelineTotal } = input;

  const evidenceByHypothesis = new Map<string, Evidence[]>();
  for (const item of evidence) {
    if (!item.hypothesisId) continue;
    const existing = evidenceByHypothesis.get(item.hypothesisId) ?? [];
    existing.push(item);
    evidenceByHypothesis.set(item.hypothesisId, existing);
  }
  const hypothesesById = new Map(hypotheses.map((h) => [h.id, h]));

  const lines: string[] = [];
  lines.push(`# Case: ${kase.title}`);
  lines.push("");
  lines.push(`Exported at: ${exportedAt}`);
  lines.push("");

  lines.push("## Case metadata");
  lines.push("");
  lines.push(`- Status: ${kase.status}`);
  lines.push(`- Severity: ${kase.severity}`);
  lines.push(`- Assignee: ${resolveUserName(userNames, kase.assigneeId)}`);
  lines.push(`- Created: ${kase.createdAt}`);
  if (kase.resolutionSummary) {
    lines.push(`- Resolution: ${kase.resolutionSummary}`);
  }
  lines.push("");

  lines.push("## Hypotheses");
  lines.push("");
  if (hypotheses.length === 0) {
    lines.push("No hypotheses proposed.");
  } else {
    for (const hypothesis of hypotheses) {
      lines.push(`- **${hypothesis.statement}** (${hypothesis.status})`);
      lines.push(`  - Proposed by ${resolveUserName(userNames, hypothesis.authorId)}`);
      if (hypothesis.conclusionStatement) {
        lines.push(`  - Conclusion: ${hypothesis.conclusionStatement}`);
      }
      const linked = evidenceByHypothesis.get(hypothesis.id) ?? [];
      if (linked.length > 0) {
        lines.push(`  - Linked evidence: ${linked.map((item) => item.source).join(", ")}`);
      }
    }
  }
  lines.push("");

  lines.push("## Evidence");
  lines.push("");
  if (evidence.length === 0) {
    lines.push("No evidence recorded.");
  } else {
    for (const item of evidence) {
      lines.push(`- **${item.type} · ${item.source}** (${item.timestamp})`);
      lines.push(`  - Recorded by ${resolveUserName(userNames, item.authorId)}`);
      lines.push(`  - ${item.content}`);
      if (item.hypothesisId) {
        const hypothesis = hypothesesById.get(item.hypothesisId);
        lines.push(`  - Linked to hypothesis: ${hypothesis?.statement ?? item.hypothesisId}`);
      }
    }
  }
  lines.push("");

  lines.push("## Notes & Comments");
  lines.push("");
  if (timelineTotal > 100) {
    lines.push("> Only the latest 100 timeline entries were available; earlier notes and comments are not included.");
    lines.push("");
  }
  if (notesAndComments.length === 0) {
    lines.push("No notes or comments.");
  } else {
    for (const entry of notesAndComments) {
      const kind = entry.kind === "note" ? "Note" : "Comment";
      lines.push(`- **${kind}** by ${entry.authorName} (${entry.createdAt})`);
      lines.push(`  - ${entry.text}`);
    }
  }
  lines.push("");

  return lines.join("\n");
}
