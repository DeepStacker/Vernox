import { useState } from 'react';
import { toast } from 'sonner';
import { Building2, Gift, PenTool, Ruler } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ContentPage } from '@/components/shop/ContentPage';
import { useCatalog } from '@/lib/catalogContext';
import { DEFAULT_CUSTOM_LEAD_TIME_DAYS } from '@/lib/pricing/customPiece';
import { useSeo } from '@/lib/seo';
import { isEmail } from '@/lib/storefront/contact';
import { sendTradeEnquiry } from '@/lib/storefront/engageApi';
import { TRADE_FINISHES, TRADE_PROJECT_TYPES, TRADE_TIMELINES, TRADE_VOLUMES } from '@/types/trade';

const USES = [
  { icon: Building2, title: 'Logo signage' },
  { icon: Gift, title: 'Corporate gifting' },
  { icon: Ruler, title: 'Trade pricing' },
  { icon: PenTool, title: 'Custom artwork' },
];

export default function Trade() {
  useSeo({
    title: 'Corporate & Bulk Orders',
    description: 'Laser-cut metal logo signage, corporate gifts and trade pricing for architects and interior designers. Request a quote from Vernox.',
    canonicalPath: '/trade',
  });
  const [form, setForm] = useState({
    name: '', email: '', company: '', phone: '', projectType: 'corporate-signage', volume: '10-25', alloyPreference: 'black_patina', timeline: '2-4 weeks', notes: '', website: '',
  });
  const { storeConfig } = useCatalog();
  // Same tiers the server charges with (settings/store via the public catalogue, parsed by toStoreConfig).
  const tiers = storeConfig.volumeDiscounts;
  const leadDays = storeConfig.customLeadTimeDays ?? DEFAULT_CUSTOM_LEAD_TIME_DAYS;
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
    try {
      const { ref } = await sendTradeEnquiry({ ...form, name: form.name.trim(), email: form.email.trim() });
      // A honeypot hit is answered without a reference; people always get one.
      setRefId(ref ?? 'received');
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : 'Your enquiry could not be sent. Please try again or contact us directly.');
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

      <div className="grid gap-4 lg:grid-cols-2">
        <section aria-labelledby="tiers-heading" className="rounded-lg border border-border bg-card p-5">
          <h2 id="tiers-heading" className="font-display text-2xl">Volume pricing</h2>
          {tiers.length > 0 ? (
            <>
              <p className="mt-1 text-sm text-muted-foreground">Taken off automatically at checkout by the number of pieces in the order, catalogue and custom together. Prices include GST.</p>
              <table className="mt-3 w-full text-sm" data-testid="trade-tiers">
                <thead><tr className="text-left text-muted-foreground"><th className="py-1 font-medium">Pieces in one order</th><th className="py-1 text-right font-medium">Discount</th></tr></thead>
                <tbody>
                  {tiers.map((tier, i) => (
                    <tr key={tier.minUnits} className="border-t border-border">
                      <td className="py-2">{tiers[i + 1] ? `${tier.minUnits} to ${tiers[i + 1].minUnits - 1}` : `${tier.minUnits} or more`}</td>
                      <td className="py-2 text-right font-semibold">{tier.percent}% off</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-xs text-muted-foreground">One discount per order: a coupon applies instead when it saves more. Larger projects are quoted below.</p>
            </>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">Ask for project pricing below; we quote every bulk order.</p>
          )}
        </section>

        <section aria-labelledby="batch-heading" className="flex flex-col rounded-lg border border-border bg-card p-5">
          <h2 id="batch-heading" className="font-display text-2xl">Personalise many plates at once</h2>
          <p className="mt-1 flex-1 text-sm text-muted-foreground">
            Door numbers for a building, name plates for every cabin: pick a design, upload a spreadsheet (CSV) with one row per plate, check
            each preview and price, and add them all to the cart in one go.
          </p>
          <Link to="/studio?batch=1" className="btn-primary mt-4 self-start">Open the batch studio</Link>
        </section>
      </div>

      <section aria-labelledby="how-heading">
        <h2 id="how-heading" className="mb-3 font-display text-2xl">How bulk and corporate orders work</h2>
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { title: 'Tell us the project', body: 'Quantities, sizes, finish and your logo or text. We reply with a quote, usually within one working day.' },
            { title: 'Approve a proof', body: 'For logos and custom artwork we send a drawing of every piece to approve. Nothing is cut before you say yes.' },
            { title: 'Production', body: `Custom pieces take about ${leadDays} working days to make; large runs are scheduled with you, and dispatch dates are confirmed in the quote.` },
            { title: 'GST invoice', body: 'Every order comes with a GST tax invoice. Need your company GSTIN on it? Give it in the enquiry and we confirm the invoicing with you before you pay.' },
          ].map((step, i) => (
            <li key={step.title} className="rounded-lg border border-border bg-card p-4">
              <p className="text-xs font-semibold text-brass">Step {i + 1}</p>
              <p className="mt-1 font-semibold">{step.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="quote-heading" className="max-w-2xl">
        <h2 id="quote-heading" className="font-display text-2xl">Request a quote</h2>
        <p className="mb-3 mt-1 text-sm text-muted-foreground">Have a logo or artwork file? Send the enquiry first; our reply comes by email, and you can attach the file to your answer.</p>
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
              <select value={form.projectType} onChange={set('projectType')} className="field mt-1 font-normal">{TRADE_PROJECT_TYPES.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select>
            </label>
            <label className="text-sm font-medium">Quantity
              <select value={form.volume} onChange={set('volume')} className="field mt-1 font-normal">{TRADE_VOLUMES.map(v => <option key={v}>{v}</option>)}</select>
            </label>
            <label className="text-sm font-medium">Finish
              <select value={form.alloyPreference} onChange={set('alloyPreference')} className="field mt-1 font-normal">{TRADE_FINISHES.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}</select>
            </label>
            <label className="text-sm font-medium">Timeline
              <select value={form.timeline} onChange={set('timeline')} className="field mt-1 font-normal">{TRADE_TIMELINES.map(t => <option key={t}>{t}</option>)}</select>
            </label>
            <label className="text-sm font-medium sm:col-span-2">Project details
              <textarea rows={4} value={form.notes} onChange={set('notes')} maxLength={4000} className="field mt-1 font-normal" placeholder="Sizes, text or logo, where it will be installed, and your company GSTIN if you need it on the invoice" />
            </label>
            <div className="absolute -left-[9999px] h-0 w-0 overflow-hidden" aria-hidden="true">
              <label>Leave this empty<input tabIndex={-1} autoComplete="off" value={form.website} onChange={set('website')} /></label>
            </div>
            <button type="submit" disabled={submitting} className="btn-primary sm:col-span-2">{submitting ? 'Sending...' : 'Send enquiry'}</button>
          </form>
        )}
      </section>
    </ContentPage>
  );
}
