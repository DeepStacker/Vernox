import { useState } from 'react';
import { addDoc, collection } from 'firebase/firestore';
import { toast } from 'sonner';
import { Building2, Gift, PenTool, Ruler } from 'lucide-react';
import { ContentPage } from '@/components/shop/ContentPage';
import { db } from '@/lib/firebase';
import { useSeo } from '@/lib/seo';
import { isEmail } from '@/lib/storefront/contact';

const USES = [
  { icon: Building2, title: 'Logo signage' },
  { icon: Gift, title: 'Corporate gifting' },
  { icon: Ruler, title: 'Trade pricing' },
  { icon: PenTool, title: 'Custom artwork' },
];

const PROJECT_TYPES = [
  { id: 'corporate-signage', label: 'Logo signage' },
  { id: 'corporate-gifting', label: 'Corporate gifting' },
  { id: 'interior-design', label: 'Architect or interior designer' },
  { id: 'hospitality', label: 'Hotel, restaurant or cafe' },
  { id: 'other', label: 'Something else' },
];
const VOLUMES = ['1-10', '10-25', '25-50', '50-100', '100+'];
const TIMELINES = ['Under 2 weeks', '2-4 weeks', '1-2 months', 'Flexible'];
const FINISHES = [
  { id: 'black_patina', label: 'Black powder coat' }, { id: 'brass', label: 'Brass' }, { id: 'gold', label: 'Gold' },
  { id: 'copper', label: 'Copper' }, { id: 'stainless', label: 'Stainless steel' }, { id: 'corten_rust', label: 'Corten rust' },
];

export default function Trade() {
  useSeo({
    title: 'Corporate & Bulk Orders',
    description: 'Laser-cut metal logo signage, corporate gifts and trade pricing for architects and interior designers. Request a quote from Vernox.',
    canonicalPath: '/trade',
  });
  const [form, setForm] = useState({
    name: '', email: '', company: '', phone: '', projectType: 'corporate-signage', volume: '10-25', alloyPreference: 'black_patina', timeline: '2-4 weeks', notes: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [refId, setRefId] = useState('');

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [key]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !isEmail(form.email.trim())) {
      toast.error('Please enter your name and a valid email address.');
      return;
    }
    setSubmitting(true);
    const id = `VNX-B2B-${Math.floor(1000 + Math.random() * 9000)}`;
    // Payload shape is enforced by firestore.rules (validInquiry); do not add or rename fields.
    const payload = { ...form, name: form.name.trim(), email: form.email.trim(), refId: id, createdAt: new Date().toISOString(), status: 'pending_review' };
    try {
      await addDoc(collection(db, 'b2b_inquiries'), payload);
      setRefId(id);
    } catch (err) {
      console.error('Trade enquiry could not be saved:', err);
      toast.error('Your enquiry could not be sent. Please try again or contact us directly.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ContentPage title="Corporate & bulk orders" intro="Logo signage, gifts and project pricing." wide>
      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {USES.map(({ icon: Icon, title }) => (
          <li key={title} className="flex items-center gap-3 rounded-lg border border-border bg-card p-4">
            <Icon className="h-6 w-6 shrink-0 text-brass" aria-hidden="true" />
            <span className="font-display text-xl">{title}</span>
          </li>
        ))}
      </ul>

      <section aria-labelledby="quote-heading" className="max-w-2xl">
        <h2 id="quote-heading" className="mb-3 font-display text-2xl">Request a quote</h2>
        {refId ? (
          <div role="status" className="rounded-lg border border-border bg-card p-6">
            <p className="font-display text-2xl">Thank you. We have your enquiry.</p>
            <p className="mt-1 text-muted-foreground">Reference <strong>{refId}</strong>. We will reply with a quote.</p>
          </div>
        ) : (
          <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium">Your name *<input required value={form.name} onChange={set('name')} className="field mt-1 font-normal" autoComplete="name" /></label>
            <label className="text-sm font-medium">Email *<input required type="email" value={form.email} onChange={set('email')} className="field mt-1 font-normal" autoComplete="email" /></label>
            <label className="text-sm font-medium">Company or studio<input value={form.company} onChange={set('company')} className="field mt-1 font-normal" autoComplete="organization" /></label>
            <label className="text-sm font-medium">Phone<input type="tel" value={form.phone} onChange={set('phone')} className="field mt-1 font-normal" autoComplete="tel" /></label>
            <label className="text-sm font-medium">What do you need?
              <select value={form.projectType} onChange={set('projectType')} className="field mt-1 font-normal">{PROJECT_TYPES.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select>
            </label>
            <label className="text-sm font-medium">Quantity
              <select value={form.volume} onChange={set('volume')} className="field mt-1 font-normal">{VOLUMES.map(v => <option key={v}>{v}</option>)}</select>
            </label>
            <label className="text-sm font-medium">Finish
              <select value={form.alloyPreference} onChange={set('alloyPreference')} className="field mt-1 font-normal">{FINISHES.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}</select>
            </label>
            <label className="text-sm font-medium">Timeline
              <select value={form.timeline} onChange={set('timeline')} className="field mt-1 font-normal">{TIMELINES.map(t => <option key={t}>{t}</option>)}</select>
            </label>
            <label className="text-sm font-medium sm:col-span-2">Project details
              <textarea rows={4} value={form.notes} onChange={set('notes')} maxLength={4000} className="field mt-1 font-normal" placeholder="Sizes, text or logo, where it will be installed" />
            </label>
            <button type="submit" disabled={submitting} className="btn-primary sm:col-span-2">{submitting ? 'Sending...' : 'Send enquiry'}</button>
          </form>
        )}
      </section>
    </ContentPage>
  );
}
