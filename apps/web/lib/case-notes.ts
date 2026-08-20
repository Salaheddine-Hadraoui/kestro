import type { TimelineEventWithAuthor, UserRole } from "./api/types";

export interface HumanEntry {
  id: string;
  kind: "note" | "comment";
  text: string;
  authorName: string;
  authorRole: UserRole;
  createdAt: string;
}

function textOf(content: Record<string, unknown>): string {
  return typeof content.text === "string" ? content.text : "";
}

// The `note` timeline-event type is overloaded: Cases/Investigations also
// write system-generated `note` events (assignee_changed, hypothesis_*)
// that carry no human-authored text. Only a note whose content discriminator
// is "note_added" was actually written by a human via POST .../notes -- see
// apps/api/src/cases/cases.service.ts's addNote(). `comment` has exactly one
// meaning, so it needs no discriminator check.
export function extractHumanEntries(events: TimelineEventWithAuthor[]): HumanEntry[] {
  const entries: HumanEntry[] = [];
  for (const event of events) {
    if (event.type === "comment") {
      entries.push({
        id: event.id,
        kind: "comment",
        text: textOf(event.content),
        authorName: event.author.name,
        authorRole: event.author.role,
        createdAt: event.createdAt,
      });
    } else if (event.type === "note" && event.content.event === "note_added") {
      entries.push({
        id: event.id,
        kind: "note",
        text: textOf(event.content),
        authorName: event.author.name,
        authorRole: event.author.role,
        createdAt: event.createdAt,
      });
    }
  }
  return entries;
}
