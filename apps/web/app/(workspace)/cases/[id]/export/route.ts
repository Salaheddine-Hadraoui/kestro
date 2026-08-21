import { NextResponse } from "next/server";
import { getCase, listCaseTimelineEntries } from "@/features/cases/service";
import { listHypotheses } from "@/features/investigations/service";
import { listEvidence } from "@/features/evidence/service";
import { listUsers } from "@/features/users/service";
import { buildUserNameMap } from "@/lib/format-user";
import { extractHumanEntries } from "@/lib/case-notes";
import { renderCaseExport } from "@/lib/case-export";
import { ApiError, SessionExpiredError } from "@/lib/server/api-client";

// A Route Handler, not a page: like app/session-expired/route.ts, this
// needs to return a response shape (a file download) a Server Component
// page cannot produce. Reuses the exact services the case detail page
// already calls -- no new backend endpoint, no new authorization logic.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let kase;
  try {
    kase = await getCase(id);
  } catch (error) {
    if (error instanceof SessionExpiredError) {
      return NextResponse.redirect(new URL("/session-expired", request.url));
    }
    if (error instanceof ApiError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }
    throw error;
  }

  const [users, timeline, hypotheses, evidence] = await Promise.all([
    listUsers(),
    listCaseTimelineEntries(id),
    listHypotheses(id),
    listEvidence(id),
  ]);

  const markdown = renderCaseExport({
    kase,
    userNames: buildUserNameMap(users),
    hypotheses,
    evidence,
    notesAndComments: extractHumanEntries(timeline.data),
    exportedAt: new Date().toISOString(),
    timelineTotal: timeline.total,
  });

  const isoDate = new Date().toISOString().slice(0, 10);
  return new NextResponse(markdown, {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="case-${id}-${isoDate}.md"`,
    },
  });
}
