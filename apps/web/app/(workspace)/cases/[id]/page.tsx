import { verifySession } from "@/features/auth/dal";
import { getCase, listCaseTimelineEntries } from "@/features/cases/service";
import { listUsers } from "@/features/users/service";
import { buildUserNameMap, resolveUserName } from "@/lib/format-user";
import { ApiError } from "@/lib/server/api-client";
import { EmptyState } from "@/components/ui/empty-state";
import { getAvailableActions } from "@/lib/case-transitions";
import { TransitionButton } from "./transition-button";
import { ReassignForm } from "./reassign-form";

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
            <dd>{kase.status}</dd>
          </div>
          <div>
            <dt className="text-black/60 dark:text-white/60">Severity</dt>
            <dd>{kase.severity}</dd>
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
          <p className="rounded-md border border-black/10 p-4 text-sm dark:border-white/10">
            <span className="font-medium">Resolution: </span>
            {kase.resolutionSummary}
          </p>
        )}
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-black/60 dark:text-white/60">
          Linked alerts
        </h2>
        {kase.alerts.length === 0 ? (
          <p className="text-sm text-black/60 dark:text-white/60">No alerts linked to this case.</p>
        ) : (
          <ul className="space-y-2">
            {kase.alerts.map((alert) => (
              <li key={alert.id} className="rounded-md border border-black/10 p-3 text-sm dark:border-white/10">
                <span className="font-medium">{alert.summary}</span>
                <span className="text-black/60 dark:text-white/60"> · {alert.severity} · {alert.source}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-black/60 dark:text-white/60">
          Actions
        </h2>
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
      </section>
    </div>
  );
}
