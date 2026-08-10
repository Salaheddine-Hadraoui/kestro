import type { TimelineEvent, UserRole } from '../../../generated/prisma/client';

// The minimal, non-sensitive author summary a timeline entry needs to be
// meaningful in the UI ("who did this") — deliberately narrower than
// PublicUser (no email) since a timeline reader only needs an identity, not
// contact details.
export interface TimelineEventAuthor {
  id: string;
  name: string;
  role: UserRole;
}

export interface TimelineEventWithAuthor extends TimelineEvent {
  author: TimelineEventAuthor;
}

export interface PaginatedTimelineEvents {
  data: TimelineEventWithAuthor[];
  total: number;
  limit: number;
  offset: number;
}
