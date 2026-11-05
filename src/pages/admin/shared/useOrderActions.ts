/**
 * Order writes for the staff consoles. Wraps the restricted order update mutation (status,
 * assignedTo, notes only) with the signed-in staff identity, so every console records who acted.
 */
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth/AuthProvider';
import { opsApi } from '@/lib/data/orderOps';
import { useOrderMutations } from '@/lib/data/orders';
import { errorMessage } from '@/lib/data/optimistic';
import { appendNote } from '@/lib/orders/orderNotes';
import { ORDER_STATUS_LABELS, type OrderStatus } from '@/lib/orders/orderStateMachine';
import type { Order } from '@/types/store';

export function useOrderActions() {
  const { user, staffRole, permissions } = useAuth();
  const { updateOrder } = useOrderMutations();
  const qc = useQueryClient();
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
    /** Roles that may write orders add notes directly; support (customers.read) goes through ADD_ORDER_NOTE. */
    canAddNote: Boolean(permissions?.canUpdateOrders || permissions?.canManageSupport),
    claim: (order: Order) => write(order, { assignedTo: who }),
    release: (order: Order) => write(order, { assignedTo: '' }),
    moveTo: async (order: Order, status: OrderStatus, notes?: string) => {
      const ok = await write(order, { status, ...(notes !== undefined ? { notes } : {}) });
      if (ok) toast.success(`${order.orderNumber || order.id} moved to ${ORDER_STATUS_LABELS[status]}`);
      return ok;
    },
    addNote: async (order: Order, text: string): Promise<boolean> => {
      if (permissions?.canUpdateOrders) return write(order, { notes: appendNote(order.adminNotes, text, who, Date.now()) });
      try {
        await opsApi.addOrderNote(order.id, text);
        await qc.invalidateQueries({ queryKey: ['admin', 'orders'] });
        return true;
      } catch (err) {
        toast.error(`Note was not added: ${errorMessage(err, 'please try again')}`);
        return false;
      }
    },
    saveNotes: (order: Order, notes: string) => write(order, { notes }),
  };
}
