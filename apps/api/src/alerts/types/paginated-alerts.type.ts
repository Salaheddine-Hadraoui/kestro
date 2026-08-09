import type { Alert } from '../../../generated/prisma/client';

export interface PaginatedAlerts {
  data: Alert[];
  total: number;
  limit: number;
  offset: number;
}
