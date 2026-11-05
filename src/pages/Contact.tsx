import { useState } from 'react';
import { toast } from 'sonner';
import { Clock, Mail, MapPin, MessageCircle, Phone } from 'lucide-react';
import { ContentPage, DraftNote } from '@/components/shop/ContentPage';
import { useCatalog } from '@/lib/catalogContext';
import { useSeo } from '@/lib/seo';
import { isEmail, resolveContact, whatsappLink } from '@/lib/storefront/contact';

const TOPICS = ['Order help', 'Custom or bulk order', 'Product question', 'Something else'];

/**
 * There is no message store behind this form yet (firestore.rules has no collection for it), so it
 * opens the visitor's email app or WhatsApp with the message filled in instead of pretending to submit.
 */
export default function Contact() {
  useSeo({ title: 'Contact', description: 'Contact Vernox for order help, custom pieces and corporate enquiries.' });
  const { storeConfig } = useCatalog();
  const contact = resolveContact(storeConfig);
  const [form, setForm] = useState({ name: '', email: '', phone: '', topic: TOPICS[0], message: '' });
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [key]: e.target.value }));

  const body = `${form.message}\n\nName: ${form.name}\nEmail: ${form.email}\nPhone: ${form.phone}`;
  const whatsapp = whatsappLink(contact, `${form.topic}: ${body}`);
  const emailReady = isEmail(contact.email);

  const sendByEmail = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !isEmail(form.email) || !form.message.trim()) {
      toast.error('Please enter your name, a valid email and a message.');
      return;
    }
    if (!emailReady) {
      toast.error('Our support email is not set up yet. Please use the phone number or WhatsApp.');
      return;
    }
    window.location.href = `mailto:${contact.email}?subject=${encodeURIComponent(`${form.topic} (Vernox website)`)}&body=${encodeURIComponent(body)}`;
  };

  return (
    <ContentPage title="Contact us" intro="Questions about an order, a custom piece or a bulk quote? We are happy to help." wide>
      <DraftNote>Contact details below come from store settings. Placeholders in [brackets] are to be filled by the owner.</DraftNote>
      <div className="grid gap-10 lg:grid-cols-[1fr_1.2fr]">
        <ul className="space-y-4 text-sm">
          <li className="flex gap-3"><Mail className="h-5 w-5 shrink-0 text-brass" aria-hidden="true" /><span>{contact.email}</span></li>
          <li className="flex gap-3"><Phone className="h-5 w-5 shrink-0 text-brass" aria-hidden="true" /><span>{contact.phone}</span></li>
          <li className="flex gap-3"><Clock className="h-5 w-5 shrink-0 text-brass" aria-hidden="true" /><span>{contact.hours}</span></li>
          <li className="flex gap-3"><MapPin className="h-5 w-5 shrink-0 text-brass" aria-hidden="true" /><span>{contact.address}</span></li>
          <li>
            {whatsapp
              ? <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="btn-secondary"><MessageCircle className="h-4 w-4" aria-hidden="true" /> Chat on WhatsApp</a>
              : <span className="flex gap-3"><MessageCircle className="h-5 w-5 shrink-0 text-brass" aria-hidden="true" />WhatsApp: [number to be added]</span>}
          </li>
        </ul>

        <form onSubmit={sendByEmail} className="grid gap-4 sm:grid-cols-2" aria-label="Contact form">
          <label className="text-sm font-medium">Name *<input required value={form.name} onChange={set('name')} className="field mt-1 font-normal" autoComplete="name" /></label>
          <label className="text-sm font-medium">Email *<input required type="email" value={form.email} onChange={set('email')} className="field mt-1 font-normal" autoComplete="email" /></label>
          <label className="text-sm font-medium">Phone<input type="tel" value={form.phone} onChange={set('phone')} className="field mt-1 font-normal" autoComplete="tel" /></label>
          <label className="text-sm font-medium">Topic
            <select value={form.topic} onChange={set('topic')} className="field mt-1 font-normal">{TOPICS.map(t => <option key={t}>{t}</option>)}</select>
          </label>
          <label className="text-sm font-medium sm:col-span-2">Message *<textarea required rows={5} value={form.message} onChange={set('message')} className="field mt-1 font-normal" /></label>
          <button type="submit" className="btn-primary sm:col-span-2">Send by email</button>
        </form>
      </div>
    </ContentPage>
  );
}
