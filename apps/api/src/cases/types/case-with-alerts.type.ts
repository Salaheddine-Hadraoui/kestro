import type { Alert, Case } from '../../../generated/prisma/client';

// Case plus its currently-linked alerts (docs/PRODUCT.md: "A Case may
// contain multiple Alerts") — a case's alerts are fundamental viewing
// context, not a speculative addition.
export interface CaseWithAlerts extends Case {
  alerts: Alert[];
}

export interface PaginatedCases {
  data: Case[];
  total: number;
  limit: number;
  offset: number;
}
