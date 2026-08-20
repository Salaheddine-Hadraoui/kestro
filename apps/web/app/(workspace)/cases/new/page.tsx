import { verifySession } from "@/features/auth/dal";
import { listUsers } from "@/features/users/service";
import { getAlert } from "@/features/alerts/service";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SEVERITY_BADGE_TONE } from "@/lib/badge-tones";
import { CaseForm } from "./case-form";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Mirrors app/(workspace)/cases/page.tsx's firstValue helper, generalized to
// keep every value instead of just the first: unlike status/severity, this
// param is genuinely multi-valued (one alert or several, arriving from the
// alerts list's checkbox selection or a single alert-detail link).
function toAlertIds(value: string | string[] | undefined): string[] {
  const values = Array.isArray(value) ? value : value !== undefined ? [value] : [];
  return [...new Set(values.filter((candidate) => UUID_RE.test(candidate)))];
}

export default async function NewCasePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const user = await verifySession();
  const users = user.role === "lead" ? await listUsers() : [];
  const activeUsers = users.filter((candidate) => !candidate.disabledAt);

  const requestedAlertIds = toAlertIds(params.alertIds);
  // A stale, since-linked/dismissed, or otherwise unresolvable id is
  // silently dropped rather than surfaced as an error here -- the worst
  // case is the case gets created with fewer linked alerts than intended,
  // never with a broken reference. If a selected alert's status has since
  // changed, createCaseAction's own error handling (unchanged by this
  // milestone) still applies when the case is actually submitted.
  const alertResults = await Promise.all(
    requestedAlertIds.map((id) => getAlert(id).catch(() => null)),
  );
  const alerts = alertResults.filter((alert): alert is NonNullable<typeof alert> => alert !== null);
  const alertIds = alerts.map((alert) => alert.id);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">New case</h1>
      {alerts.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm text-black/60 dark:text-white/60">
            This case will be created with {alerts.length} linked alert{alerts.length === 1 ? "" : "s"}:
          </p>
          <ul className="space-y-2">
            {alerts.map((alert) => (
              <Card key={alert.id} as="li" className="p-3 text-sm">
                <span className="font-medium">{alert.summary}</span>{" "}
                <Badge tone={SEVERITY_BADGE_TONE[alert.severity]}>{alert.severity}</Badge>
              </Card>
            ))}
          </ul>
        </div>
      )}
      <CaseForm role={user.role} activeUsers={activeUsers} alertIds={alertIds} />
    </div>
  );
}
