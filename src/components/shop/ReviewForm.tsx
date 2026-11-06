import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Star } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth/AuthProvider';
import { fetchReviewEligibility, submitReview } from '@/lib/storefront/engageApi';

const MIN_COMMENT = 10;
const MAX_COMMENT = 2000;

/**
 * "Write a review" entry for a product page. Shown only when the server says the signed-in customer
 * has a Delivered order containing this product and has not reviewed it yet (POST /api/engage
 * REVIEW_STATUS); everyone else sees nothing. Reviews go to moderation and are not public until approved.
 */
export function ReviewForm({ productId }: { productId: string }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const key = ['review-eligibility', user?.uid, productId] as const;
  const { data } = useQuery({ queryKey: key, queryFn: () => fetchReviewEligibility(productId), enabled: Boolean(user), staleTime: 60_000, retry: false });
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');

  const send = useMutation({
    mutationFn: () => submitReview({ productId, rating, comment }),
    onSuccess: () => {
      toast.success('Thank you. Your review will appear once we have checked it.');
      setOpen(false);
      void qc.invalidateQueries({ queryKey: key });
    },
    onError: err => toast.error(err instanceof Error ? err.message : 'Could not send your review. Please try again.'),
  });

  if (!data) return null;
  if (!data.eligible) {
    return data.reason === 'already_reviewed' && data.reviewStatus === 'pending'
      ? <p className="text-sm text-muted-foreground">Your review is waiting for approval.</p>
      : null;
  }
  if (!open) return <button type="button" className="btn-secondary" onClick={() => setOpen(true)}>Write a review</button>;

  const valid = rating >= 1 && comment.trim().length >= MIN_COMMENT;
  return (
    <form onSubmit={e => { e.preventDefault(); if (valid) send.mutate(); }} className="space-y-3 rounded-lg border border-border bg-card p-4" aria-label="Write a review">
      <fieldset>
        <legend className="mb-1 text-sm font-medium">Your rating</legend>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map(n => (
            <button key={n} type="button" onClick={() => setRating(n)} aria-label={`${n} out of 5`} aria-pressed={rating === n}
              className="flex h-11 w-11 items-center justify-center rounded-md hover:bg-muted/50">
              <Star className={n <= rating ? 'h-6 w-6 fill-brass text-brass' : 'h-6 w-6 text-border'} aria-hidden="true" />
            </button>
          ))}
        </div>
      </fieldset>
      <label className="block text-sm font-medium">Your review
        <textarea required rows={4} minLength={MIN_COMMENT} maxLength={MAX_COMMENT} value={comment} onChange={e => setComment(e.target.value)} className="field mt-1 font-normal" />
      </label>
      <div className="flex gap-2">
        <button type="submit" className="btn-primary" disabled={!valid || send.isPending}>{send.isPending ? 'Sending…' : 'Submit review'}</button>
        <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  );
}
