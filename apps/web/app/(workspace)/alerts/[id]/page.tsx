import Link from "next/link";
import { getAlert } from "@/features/alerts/service";
import { listCases } from "@/features/cases/service";
import { listUsers } from "@/features/users/service";
import { buildUserNameMap, resolveUserName } from "@/lib/format-user";
import { ApiError } from "@/lib/server/api-client";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Section } from "@/components/ui/section";
import { ALERT_STATUS_BADGE_TONE, SEVERITY_BADGE_TONE } from "@/lib/badge-tones";
import { DismissForm } from "./dismiss-form";
import { LinkToCaseForm } from "./link-to-case-form";

export default async function AlertDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let alert;
  try {
    alert = await getAlert(id);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return <EmptyState title="Alert not found" description={`No alert matches id "${id}".`} />;
    }
    throw error;
  }

  const isNew = alert.status === "new";
  const isDismissed = alert.status === "dismissed";

  // Cases are fetched only when the alert can still be linked, and users
  // only to resolve who dismissed it -- neither call is needed for a
  // "linked" alert, and GET /alerts/:id cannot report which case a linked
  // alert belongs to (no controller path currently includes that relation;
  // out of scope for this milestone's approved backend change).
  const [users, casesPage] = await Promise.all([
    isDismissed ? listUsers() : Promise.resolve([]),
    isNew ? listCases({ limit: 100 }) : Promise.resolve({ data: [], total: 0, limit: 0, offset: 0 }),
  ]);
  const userNames = buildUserNameMap(users);
  const linkableCases = casesPage.data
    .filter((kase) => kase.status !== "RESOLVED")
    .map((kase) => ({ id: kase.id, title: kase.title }));

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">{alert.summary}</h1>
        <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-black/60 dark:text-white/60">Status</dt>
            <dd>
              <Badge tone={ALERT_STATUS_BADGE_TONE[alert.status]}>{alert.status}</Badge>
            </dd>
          </div>
          <div>
            <dt className="text-black/60 dark:text-white/60">Severity</dt>
            <dd>
              <Badge tone={SEVERITY_BADGE_TONE[alert.severity]}>{alert.severity}</Badge>
            </dd>
          </div>
          <div>
            <dt className="text-black/60 dark:text-white/60">Source</dt>
            <dd>{alert.source}</dd>
          </div>
          <div>
            <dt className="text-black/60 dark:text-white/60">Created</dt>
            <dd>{new Date(alert.createdAt).toLocaleString()}</dd>
          </div>
        </dl>
        {isDismissed && (
          <Card as="p" className="p-4">
            <span className="font-medium">
              Dismissed
              {alert.dismissedById ? ` by ${resolveUserName(userNames, alert.dismissedById)}` : ""}
              {alert.dismissedAt ? ` on ${new Date(alert.dismissedAt).toLocaleString()}` : ""}:{" "}
            </span>
            {alert.dismissReason}
          </Card>
        )}
        {alert.status === "linked" && (
          <p className="text-sm text-black/60 dark:text-white/60">
            This alert has been linked to a case.
          </p>
        )}
      </div>

      {alert.rawPayload && (
        <Section title="Raw payload">
          <Card as="pre" className="overflow-x-auto p-4 text-xs font-mono">
            {JSON.stringify(alert.rawPayload, null, 2)}
          </Card>
        </Section>
      )}

      {isNew && (
        <Section title="Actions">
          <div className="flex flex-wrap gap-4">
            <Link
              href={`/cases/new?alertIds=${encodeURIComponent(alert.id)}`}
              className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-black/80 dark:bg-white dark:text-black dark:hover:bg-white/80"
            >
              Create case from this alert
            </Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <DismissForm alertId={alert.id} />
            <LinkToCaseForm alertId={alert.id} cases={linkableCases} />
          </div>
        </Section>
      )}
    </div>
  );
}
