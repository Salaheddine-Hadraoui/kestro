import Link from "next/link";
import { verifySession } from "@/features/auth/dal";
import { getCase, listCaseTimelineEntries } from "@/features/cases/service";
import { listUsers } from "@/features/users/service";
import { listHypotheses } from "@/features/investigations/service";
import { listEvidence } from "@/features/evidence/service";
import { buildUserNameMap, resolveUserName } from "@/lib/format-user";
import { ApiError } from "@/lib/server/api-client";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Section } from "@/components/ui/section";
import { CASE_STATUS_BADGE_TONE, HYPOTHESIS_STATUS_BADGE_TONE, SEVERITY_BADGE_TONE } from "@/lib/badge-tones";
import { getAvailableActions } from "@/lib/case-transitions";
import { extractHumanEntries } from "@/lib/case-notes";
import { TransitionButton } from "./transition-button";
import { ReassignForm } from "./reassign-form";
import { CaseEntryForm } from "./case-entry-form";
import { ProposeHypothesisForm } from "./propose-hypothesis-form";
import { ValidateHypothesisForm } from "./validate-hypothesis-form";
import { RejectHypothesisForm } from "./reject-hypothesis-form";
import { LinkEvidenceForm } from "./link-evidence-form";
import { AddEvidenceForm } from "./add-evidence-form";
import { addCommentAction, addNoteAction } from "./actions";

const NOTES_AND_COMMENTS_LIMIT = 100;

export default async function CaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await verifySession();

  let kase;
  try {
    kase = await getCase(id);
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) {
      return (
        <EmptyState
          title="You don't have access to this case"
          description="Only the case's assignee or a Lead can view it."
        />
      );
    }
    if (error instanceof ApiError && error.status === 404) {
      return <EmptyState title="Case not found" description={`No case matches id "${id}".`} />;
    }
    throw error;
  }

  const [users, timeline, hypotheses, evidence] = await Promise.all([
    listUsers(),
    listCaseTimelineEntries(id),
    listHypotheses(id),
    listEvidence(id),
  ]);
  const userNames = buildUserNameMap(users);
  const isResolved = kase.status === "RESOLVED";
  const unlinkedEvidence = evidence.filter((item) => item.hypothesisId === null);
  const evidenceByHypothesis = new Map<string, typeof evidence>();
  for (const item of evidence) {
    if (!item.hypothesisId) continue;
    const existing = evidenceByHypothesis.get(item.hypothesisId) ?? [];
    existing.push(item);
    evidenceByHypothesis.set(item.hypothesisId, existing);
  }
  const hypothesesById = new Map(hypotheses.map((hypothesis) => [hypothesis.id, hypothesis]));

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-xl font-semibold">{kase.title}</h1>
          <Link href={`/cases/${kase.id}/export`} className="text-sm underline">
            Export as Markdown
          </Link>
        </div>
        <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-black/60 dark:text-white/60">Status</dt>
            <dd>
              <Badge tone={CASE_STATUS_BADGE_TONE[kase.status]}>{kase.status}</Badge>
            </dd>
          </div>
          <div>
            <dt className="text-black/60 dark:text-white/60">Severity</dt>
            <dd>
              <Badge tone={SEVERITY_BADGE_TONE[kase.severity]}>{kase.severity}</Badge>
            </dd>
          </div>
          <div>
            <dt className="text-black/60 dark:text-white/60">Assignee</dt>
            <dd>{resolveUserName(userNames, kase.assigneeId)}</dd>
          </div>
          <div>
            <dt className="text-black/60 dark:text-white/60">Created</dt>
            <dd>{new Date(kase.createdAt).toLocaleString()}</dd>
          </div>
        </dl>
        {kase.status === "RESOLVED" && kase.resolutionSummary && (
          <Card as="p" className="p-4">
            <span className="font-medium">Resolution: </span>
            {kase.resolutionSummary}
          </Card>
        )}
      </div>

      <Section title="Linked alerts" className="space-y-2">
        {kase.alerts.length === 0 ? (
          <p className="text-sm text-black/60 dark:text-white/60">No alerts linked to this case.</p>
        ) : (
          <ul className="space-y-2">
            {kase.alerts.map((alert) => (
              <Card key={alert.id} as="li" className="p-3">
                <span className="font-medium">{alert.summary}</span>{" "}
                <Badge tone={SEVERITY_BADGE_TONE[alert.severity]}>{alert.severity}</Badge>
                <span className="text-black/60 dark:text-white/60"> · {alert.source}</span>
              </Card>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Actions">
        <div className="flex flex-wrap gap-4">
          {getAvailableActions(kase.status, user.role).map((rule) => (
            <TransitionButton key={rule.action} caseId={kase.id} rule={rule} />
          ))}
        </div>
        {user.role === "lead" && (
          <ReassignForm
            caseId={kase.id}
            activeUsers={users.filter((candidate) => !candidate.disabledAt && candidate.id !== kase.assigneeId)}
          />
        )}
      </Section>

      <Section title="Hypotheses">
        {hypotheses.length === 0 ? (
          <p className="text-sm text-black/60 dark:text-white/60">No hypotheses proposed yet.</p>
        ) : (
          <ul className="space-y-3">
            {hypotheses.map((hypothesis) => {
              const linkedEvidence = evidenceByHypothesis.get(hypothesis.id) ?? [];
              return (
                <Card key={hypothesis.id} as="li" className="space-y-2 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm">{hypothesis.statement}</p>
                    <Badge tone={HYPOTHESIS_STATUS_BADGE_TONE[hypothesis.status]}>{hypothesis.status}</Badge>
                  </div>
                  <p className="text-xs text-black/60 dark:text-white/60">
                    Proposed by {resolveUserName(userNames, hypothesis.authorId)}
                  </p>
                  {hypothesis.status !== "proposed" && hypothesis.conclusionStatement && (
                    <p className="text-sm text-black/60 dark:text-white/60">
                      <span className="font-medium">Conclusion: </span>
                      {hypothesis.conclusionStatement}
                    </p>
                  )}
                  {linkedEvidence.length > 0 && (
                    <p className="text-xs text-black/60 dark:text-white/60">
                      Linked evidence: {linkedEvidence.map((item) => item.source).join(", ")}
                    </p>
                  )}
                  {hypothesis.status === "proposed" && !isResolved && (
                    <div className="grid gap-4 sm:grid-cols-3">
                      <ValidateHypothesisForm caseId={kase.id} hypothesisId={hypothesis.id} />
                      <RejectHypothesisForm caseId={kase.id} hypothesisId={hypothesis.id} />
                      <LinkEvidenceForm
                        caseId={kase.id}
                        hypothesisId={hypothesis.id}
                        evidenceOptions={unlinkedEvidence.map((item) => ({
                          id: item.id,
                          source: item.source,
                          type: item.type,
                          timestamp: item.timestamp,
                        }))}
                      />
                    </div>
                  )}
                </Card>
              );
            })}
          </ul>
        )}
        {!isResolved && <ProposeHypothesisForm caseId={kase.id} />}
      </Section>

      <Section title="Evidence">
        {evidence.length === 0 ? (
          <p className="text-sm text-black/60 dark:text-white/60">No evidence recorded yet.</p>
        ) : (
          <ul className="space-y-2">
            {evidence.map((item) => (
              <Card key={item.id} as="li" className="p-3">
                <div className="flex items-center justify-between text-xs text-black/60 dark:text-white/60">
                  <span>
                    {item.type} · {item.source}
                  </span>
                  <span>{new Date(item.timestamp).toLocaleString()}</span>
                </div>
                <p className="mt-1 text-xs text-black/50 dark:text-white/50">
                  Recorded by {resolveUserName(userNames, item.authorId)}
                </p>
                <p className="mt-1 text-sm">{item.content}</p>
                {item.hypothesisId && (
                  <p className="mt-1 text-xs text-black/50 dark:text-white/50">
                    Linked to hypothesis: {hypothesesById.get(item.hypothesisId)?.statement ?? item.hypothesisId}
                  </p>
                )}
              </Card>
            ))}
          </ul>
        )}
        {!isResolved && <AddEvidenceForm caseId={kase.id} />}
      </Section>

      <Section title="Notes & Comments" className="space-y-4">
        {timeline.total > NOTES_AND_COMMENTS_LIMIT && (
          <p className="text-xs text-black/50 dark:text-white/50">
            Showing the latest {NOTES_AND_COMMENTS_LIMIT} timeline entries; earlier entries are not shown here.
          </p>
        )}
        {(() => {
          const entries = extractHumanEntries(timeline.data);
          return entries.length === 0 ? (
            <p className="text-sm text-black/60 dark:text-white/60">No notes or comments yet.</p>
          ) : (
            <ul className="space-y-3">
              {entries.map((entry) => (
                <Card key={entry.id} as="li" className="p-3">
                  <div className="flex items-center justify-between text-xs text-black/60 dark:text-white/60">
                    <span>
                      {entry.kind === "note" ? "Note" : "Comment"} by {entry.authorName}
                    </span>
                    <span>{new Date(entry.createdAt).toLocaleString()}</span>
                  </div>
                  <p className="mt-1">{entry.text}</p>
                </Card>
              ))}
            </ul>
          );
        })()}
        {kase.status !== "RESOLVED" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <CaseEntryForm caseId={kase.id} kind="note" action={addNoteAction} />
            <CaseEntryForm caseId={kase.id} kind="comment" action={addCommentAction} />
          </div>
        )}
      </Section>
    </div>
  );
}
