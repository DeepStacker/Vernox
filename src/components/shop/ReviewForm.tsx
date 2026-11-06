import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ImagePlus, Star, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth/AuthProvider';
import { MAX_REVIEW_PHOTOS, uploadReviewPhoto } from '@/lib/data/reviewPhotos';
import { fetchReviewEligibility, submitReview } from '@/lib/storefront/engageApi';

const MIN_COMMENT = 10;
const MAX_COMMENT = 2000;

/**
 * "Write a review" entry for a product page. Shown only when the server says the signed-in customer
 * has a Delivered order containing this product and has not reviewed it yet (POST /api/engage
 * REVIEW_STATUS); everyone else sees nothing. Reviews go to moderation and are not public until approved.
 * Up to 3 photos are uploaded to a private folder and become public only with the approved review.
 */
export function ReviewForm({ productId }: { productId: string }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const key = ['review-eligibility', user?.uid, productId] as const;
  const { data } = useQuery({ queryKey: key, queryFn: () => fetchReviewEligibility(productId), enabled: Boolean(user), staleTime: 60_000, retry: false });
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [photos, setPhotos] = useState<File[]>([]);
  const previews = useMemo(() => photos.map(f => URL.createObjectURL(f)), [photos]);
  useEffect(() => () => previews.forEach(u => URL.revokeObjectURL(u)), [previews]);

  const send = useMutation({
    mutationFn: async () => {
      // Photos go to the customer's private folder first; the server checks each path before keeping it.
      const photoPaths = user ? await Promise.all(photos.map(f => uploadReviewPhoto(user.uid, f))) : [];
      await submitReview({ productId, rating, comment, ...(photoPaths.length > 0 ? { photoPaths } : {}) });
    },
    onSuccess: () => {
      toast.success('Thank you. Your review will appear once we have checked it.');
      setOpen(false);
      setPhotos([]);
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

  const addPhotos = (files: FileList | null) => {
    if (!files) return;
    const chosen = [...files].filter(f => f.type.startsWith('image/'));
    if (chosen.length < files.length) toast.error('Only image files can be added.');
    setPhotos(cur => [...cur, ...chosen].slice(0, MAX_REVIEW_PHOTOS));
  };

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
      <div>
        <p className="mb-1 text-sm font-medium">Photos <span className="font-normal text-muted-foreground">(optional, up to {MAX_REVIEW_PHOTOS}; shown publicly once your review is approved)</span></p>
        <div className="flex flex-wrap gap-2">
          {previews.map((url, i) => (
            <div key={url} className="relative h-16 w-16">
              <img src={url} alt={`Photo ${i + 1}`} className="h-full w-full rounded-md border border-border object-cover" />
              <button type="button" aria-label={`Remove photo ${i + 1}`} onClick={() => setPhotos(cur => cur.filter((_, j) => j !== i))}
                className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-foreground text-background">
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            </div>
          ))}
          {photos.length < MAX_REVIEW_PHOTOS && (
            <label className="flex h-16 w-16 cursor-pointer items-center justify-center rounded-md border border-dashed border-border text-muted-foreground hover:bg-muted/50">
              <ImagePlus className="h-5 w-5" aria-hidden="true" />
              <span className="sr-only">Add photos</span>
              <input type="file" accept="image/*" multiple className="sr-only" onChange={e => { addPhotos(e.target.files); e.target.value = ''; }} />
            </label>
          )}
        </div>
      </div>
      <div className="flex gap-2">
        <button type="submit" className="btn-primary" disabled={!valid || send.isPending}>{send.isPending ? 'Sending…' : 'Submit review'}</button>
        <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  );
}
