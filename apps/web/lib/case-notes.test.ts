import { extractHumanEntries } from "./case-notes";
import type { TimelineEventWithAuthor } from "./api/types";

const author = { id: "u1", name: "Ada Lovelace", role: "analyst" as const };

function makeEvent(overrides: Partial<TimelineEventWithAuthor>): TimelineEventWithAuthor {
  return {
    id: "e1",
    caseId: "c1",
    type: "comment",
    authorId: "u1",
    content: {},
    createdAt: "2026-08-19T00:00:00.000Z",
    author,
    ...overrides,
  };
}

describe("extractHumanEntries", () => {
  it("includes a comment event with its text", () => {
    const events = [makeEvent({ type: "comment", content: { text: "Looks like phishing" } })];
    expect(extractHumanEntries(events)).toEqual([
      {
        id: "e1",
        kind: "comment",
        text: "Looks like phishing",
        authorName: "Ada Lovelace",
        authorRole: "analyst",
        createdAt: "2026-08-19T00:00:00.000Z",
      },
    ]);
  });

  it("includes a human-authored note (event: note_added) with its text", () => {
    const events = [
      makeEvent({
        type: "note",
        content: { event: "note_added", text: "Checked the firewall logs" },
      }),
    ];
    expect(extractHumanEntries(events)).toEqual([
      {
        id: "e1",
        kind: "note",
        text: "Checked the firewall logs",
        authorName: "Ada Lovelace",
        authorRole: "analyst",
        createdAt: "2026-08-19T00:00:00.000Z",
      },
    ]);
  });

  it("excludes a system-generated note event (e.g. assignee_changed)", () => {
    const events = [
      makeEvent({
        type: "note",
        content: { event: "assignee_changed", fromAssigneeId: "u1", toAssigneeId: "u2" },
      }),
    ];
    expect(extractHumanEntries(events)).toEqual([]);
  });

  it("excludes status_change, alert_linked, and evidence_added events", () => {
    const events = [
      makeEvent({ id: "e2", type: "status_change", content: { action: "begin_triage" } }),
      makeEvent({ id: "e3", type: "alert_linked", content: { alertId: "a1" } }),
      makeEvent({ id: "e4", type: "evidence_added", content: {} }),
    ];
    expect(extractHumanEntries(events)).toEqual([]);
  });

  it("treats a non-string content.text as empty rather than throwing", () => {
    const events = [makeEvent({ type: "comment", content: { text: 42 } })];
    expect(extractHumanEntries(events)).toEqual([
      {
        id: "e1",
        kind: "comment",
        text: "",
        authorName: "Ada Lovelace",
        authorRole: "analyst",
        createdAt: "2026-08-19T00:00:00.000Z",
      },
    ]);
  });

  it("preserves chronological input order", () => {
    const events = [
      makeEvent({ id: "e1", type: "comment", content: { text: "first" } }),
      makeEvent({ id: "e2", type: "comment", content: { text: "second" } }),
    ];
    expect(extractHumanEntries(events).map((e) => e.text)).toEqual(["first", "second"]);
  });
});
