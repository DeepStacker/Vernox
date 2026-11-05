/** Return queues for the Returns console, by order status (statuses come from the shared state machine). */
import type { OrderStatus } from '@/types/orderStatus';

export const RETURN_STAGES = ['Return_Requested', 'Return_Approved', 'Returned'] as const satisfies readonly OrderStatus[];

export type ReturnQueue = 'requested' | 'approved' | 'received';

export const RETURN_QUEUES: ReadonlyArray<{ id: ReturnQueue; label: string; statuses: readonly OrderStatus[] }> = [
  { id: 'requested', label: 'To review', statuses: ['Return_Requested'] },
  { id: 'approved', label: 'Awaiting parcel', statuses: ['Return_Approved'] },
  { id: 'received', label: 'Received', statuses: ['Returned'] },
];
