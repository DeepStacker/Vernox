import { useState } from 'react';
import { toast } from 'sonner';
import { CheckCircle2, Clock, Mail, MapPin, MessageCircle, Phone } from 'lucide-react';
import { ContentPage } from '@/components/shop/ContentPage';
import { useCatalog } from '@/lib/catalogContext';
import { useSeo } from '@/lib/seo';
import { isEmail, resolveContact, whatsappLink } from '@/lib/storefront/contact';
import { CONTACT_TOPICS, sendContactMessage } from '@/lib/storefront/engageApi';

/**
 * The form posts to /api/engage (CONTACT), which stores a support ticket for staff and alerts the
 * support inbox. `website` is a honeypot: hidden from people, so only bots fill it.
 */
export default function Contact() {
  useSeo({ title: 'Contact', description: 'Contact Vernox for order help, custom pieces and corporate enquiries.' });
  const { storeConfig } = useCatalog();
  const contact = resolveContact(storeConfig);
  const [form, setForm] = useState({ name: '', email: '', phone: '', topic: CONTACT_TOPICS[0] as (typeof CONTACT_TOPICS)[number], orderNumber: '', message: '', website: '' });
  const [sending, setSending] = useState(false);
  const [sentRef, setSentRef] = useState<string | null>(null);
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [key]: e.target.value }));

  const whatsapp = whatsappLink(contact, `${form.topic}: ${form.message}`.trim());

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !isEmail(form.email) || form.message.trim().length < 5) {
      toast.error('Please enter your name, a valid email and a message.');
      return;
    }
    setSending(true);
    try {
      const { ref } = await sendContactMessage({
        ...form,
        phone: form.phone.trim() || undefined,
        orderNumber: form.orderNumber.trim() || undefined,
      });
      setSentRef(ref ?? '');
      setForm(f => ({ ...f, message: '', orderNumber: '' }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not send your message. Please try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <ContentPage title="Contact" intro="We reply within one working day." wide>
      <div className="grid gap-10 lg:grid-cols-[1fr_1.2fr]">
        <ul className="space-y-4 text-sm">
          {contact.email && <li className="flex gap-3"><Mail className="h-5 w-5 shrink-0 text-brass" aria-hidden="true" /><a href={`mailto:${contact.email}`} className="hover:underline">{contact.email}</a></li>}
          {contact.phone && <li className="flex gap-3"><Phone className="h-5 w-5 shrink-0 text-brass" aria-hidden="true" /><a href={`tel:${contact.phone.replace(/[^\d+]/g, '')}`} className="hover:underline">{contact.phone}</a></li>}
          <li className="flex gap-3"><Clock className="h-5 w-5 shrink-0 text-brass" aria-hidden="true" /><span>{contact.hours}</span></li>
          {contact.address && <li className="flex gap-3"><MapPin className="h-5 w-5 shrink-0 text-brass" aria-hidden="true" /><span>{contact.address}</span></li>}
          {whatsapp && <li><a href={whatsapp} target="_blank" rel="noopener noreferrer" className="btn-secondary"><MessageCircle className="h-4 w-4" aria-hidden="true" /> WhatsApp us</a></li>}
        </ul>

        {sentRef !== null ? (
          <div role="status" className="flex flex-col items-start gap-3 rounded-lg border border-border bg-card p-6">
            <CheckCircle2 className="h-6 w-6 text-brass" aria-hidden="true" />
            <p className="font-medium">Thank you, we have your message.</p>
            <p className="text-sm text-muted-foreground">We reply within one working day{sentRef ? `. Your reference is ${sentRef}` : ''}.</p>
            <button type="button" className="btn-secondary" onClick={() => setSentRef(null)}>Send another message</button>
          </div>
        ) : (
          <form onSubmit={e => void submit(e)} className="grid gap-4 sm:grid-cols-2" aria-label="Contact form">
            <label className="text-sm font-medium">Name *<input required maxLength={120} value={form.name} onChange={set('name')} className="field mt-1 font-normal" autoComplete="name" /></label>
            <label className="text-sm font-medium">Email *<input required type="email" maxLength={254} value={form.email} onChange={set('email')} className="field mt-1 font-normal" autoComplete="email" /></label>
            <label className="text-sm font-medium">Phone<input type="tel" maxLength={20} value={form.phone} onChange={set('phone')} className="field mt-1 font-normal" autoComplete="tel" /></label>
            <label className="text-sm font-medium">Topic
              <select value={form.topic} onChange={set('topic')} className="field mt-1 font-normal">{CONTACT_TOPICS.map(t => <option key={t}>{t}</option>)}</select>
            </label>
            {form.topic === 'Order help' && (
              <label className="text-sm font-medium sm:col-span-2">Order number<input maxLength={40} value={form.orderNumber} onChange={set('orderNumber')} placeholder="VX-20261105-ABC123" className="field mt-1 font-normal" /></label>
            )}
            <label className="text-sm font-medium sm:col-span-2">Message *<textarea required minLength={5} maxLength={4000} rows={5} value={form.message} onChange={set('message')} className="field mt-1 font-normal" /></label>
            <div className="absolute -left-[9999px] h-0 w-0 overflow-hidden" aria-hidden="true">
              <label>Leave this empty<input tabIndex={-1} autoComplete="off" value={form.website} onChange={set('website')} /></label>
            </div>
            <button type="submit" disabled={sending} className="btn-primary sm:col-span-2">{sending ? 'Sending…' : 'Send message'}</button>
          </form>
        )}
      </div>
    </ContentPage>
  );
}
