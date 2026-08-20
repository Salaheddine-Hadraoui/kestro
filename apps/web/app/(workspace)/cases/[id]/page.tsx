import { verifySession } from "@/features/auth/dal";
import { getCase, listCaseTimelineEntries } from "@/features/cases/service";
import { listUsers } from "@/features/users/service";
import { buildUserNameMap, resolveUserName } from "@/lib/format-user";
import { ApiError } from "@/lib/server/api-client";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Section } from "@/components/ui/section";
import { CASE_STATUS_BADGE_TONE, SEVERITY_BADGE_TONE } from "@/lib/badge-tones";
import { getAvailableActions } from "@/lib/case-transitions";
import { extractHumanEntries } from "@/lib/case-notes";
import { TransitionButton } from "./transition-button";
import { ReassignForm } from "./reassign-form";
import { CaseEntryForm } from "./case-entry-form";
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

  const [users, timeline] = await Promise.all([listUsers(), listCaseTimelineEntries(id)]);
  const userNames = buildUserNameMap(users);

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">{kase.title}</h1>
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
