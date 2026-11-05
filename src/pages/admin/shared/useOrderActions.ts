/**
 * Order writes for the staff consoles. Wraps the restricted order update mutation (status,
 * assignedTo, notes only) with the signed-in staff identity, so every console records who acted.
 */
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth/AuthProvider';
import { useOrderMutations } from '@/lib/data/orders';
import { appendNote } from '@/lib/orders/orderNotes';
import { ORDER_STATUS_LABELS, type OrderStatus } from '@/lib/orders/orderStateMachine';
import type { Order } from '@/types/store';

export function useOrderActions() {
  const { user, staffRole, permissions } = useAuth();
  const { updateOrder } = useOrderMutations();
  const who = user?.email ?? 'unknown';

  const write = async (order: Order, update: Parameters<typeof updateOrder>[0]['update']): Promise<boolean> => {
    if (!staffRole) {
      toast.error('You are not signed in as staff.');
      return false;
    }
    return updateOrder({ order, update, actor: { email: who, role: staffRole } });
  };

  return {
    who,
    permissions,
    canWrite: Boolean(permissions?.canUpdateOrders),
    claim: (order: Order) => write(order, { assignedTo: who }),
    release: (order: Order) => write(order, { assignedTo: '' }),
    moveTo: async (order: Order, status: OrderStatus, notes?: string) => {
      const ok = await write(order, { status, ...(notes !== undefined ? { notes } : {}) });
      if (ok) toast.success(`${order.orderNumber || order.id} moved to ${ORDER_STATUS_LABELS[status]}`);
      return ok;
    },
    addNote: (order: Order, text: string) => write(order, { notes: appendNote(order.adminNotes, text, who, Date.now()) }),
    saveNotes: (order: Order, notes: string) => write(order, { notes }),
  };
}
