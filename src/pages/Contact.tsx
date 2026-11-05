import { useState } from 'react';
import { SiteHeader } from '@/components/shop/SiteHeader';
import { SiteFooter } from '@/components/shop/SiteFooter';
import { Link } from 'react-router-dom';
import { 
  Mail, 
  Phone, 
  MapPin, 
  Clock, 
  Send, 
  CheckCircle2, 
  MessageSquare, 
  ShieldCheck,
  Building2,
  Sparkles
} from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { AtelierSelect } from '@/components/ui/select';

import { useSeo } from '@/lib/seo';
export default function Contact() {
  useSeo({ title: 'Contact', description: 'Get in touch with Vernox for order help, custom laser-cut commissions and trade enquiries.' });
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    subject: 'Collector Consultation',
    message: '',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.email.trim() || !formData.message.trim()) {
      toast.error('Please complete all required fields (Name, Email, Message).');
      return;
    }

    setIsSubmitting(true);
    setTimeout(() => {
      setIsSubmitting(false);
      setSubmitted(true);
      toast.success('Your message has been received by our concierge. We will review your inquiry and follow up promptly.');
    }, 500);
  };

  return (
    <div className="min-h-screen flex flex-col bg-cream text-dark-brown selection:bg-burgundy selection:text-cream">
      <SiteHeader />

      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-12 md:py-20">
        {/* Header */}
        <div className="text-center max-w-2xl mx-auto space-y-3 mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-burgundy/10 text-burgundy text-[10px] uppercase tracking-[0.24em] font-sans font-semibold">
            <MessageSquare className="w-3.5 h-3.5 text-gold" />
            <span>Atelier Concierge & Inquiries</span>
          </div>
          <h1 className="font-editorial text-3xl sm:text-5xl text-dark-brown font-normal tracking-wide">
            Speak with the Atelier
          </h1>
          <p className="text-xs sm:text-sm text-dark-brown/70 font-sans leading-relaxed">
            Whether inquiring about a bespoke residential commission, architectural trade specifications, or hanging requirements, our concierge team is at your disposal.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
          {/* Left Column: Contact Channels & Locations */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-white p-6 sm:p-8 rounded-md border border-[#E8E1D3] space-y-6 shadow-xs">
              <h2 className="font-editorial text-2xl text-dark-brown border-b border-[#EBE4D6] pb-3">
                Concierge Channels
              </h2>

              <div className="space-y-5 text-xs font-sans">
                <div className="flex items-start gap-4">
                  <div className="w-9 h-9 rounded-full bg-burgundy/10 text-burgundy flex items-center justify-center shrink-0 mt-0.5">
                    <Mail className="w-4 h-4 text-gold" />
                  </div>
                  <div>
                    <span className="text-[10px] uppercase tracking-[0.18em] text-dark-brown/60 block">
                      Direct Email
                    </span>
                    <a href="mailto:concierge@vernoxatelier.com" className="font-semibold text-dark-brown hover:text-burgundy text-sm transition-colors">
                      concierge@vernoxatelier.com
                    </a>
                    <span className="text-[11px] text-dark-brown/50 block mt-0.5">
                      Inquiries reviewed promptly during business days
                    </span>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="w-9 h-9 rounded-full bg-burgundy/10 text-burgundy flex items-center justify-center shrink-0 mt-0.5">
                    <Phone className="w-4 h-4 text-gold" />
                  </div>
                  <div>
                    <span className="text-[10px] uppercase tracking-[0.18em] text-dark-brown/60 block">
                      Telephone Consultation
                    </span>
                    <span className="font-semibold text-dark-brown text-sm block">
                      Scheduled by Request via Concierge
                    </span>
                    <span className="text-[11px] text-dark-brown/50 block mt-0.5">
                      Telephone appointments arranged via concierge email
                    </span>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="w-9 h-9 rounded-full bg-burgundy/10 text-burgundy flex items-center justify-center shrink-0 mt-0.5">
                    <Clock className="w-4 h-4 text-gold" />
                  </div>
                  <div>
                    <span className="text-[10px] uppercase tracking-[0.18em] text-dark-brown/60 block">
                      Operating Schedule
                    </span>
                    <span className="font-semibold text-dark-brown text-sm block">
                      Monday to Friday: 09:00 – 18:00
                    </span>
                    <span className="text-[11px] text-dark-brown/50 block mt-0.5">
                      Saturday: 10:00 – 14:00 (Private Consultations)
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Links Card */}
            <div className="bg-cream/50 p-6 rounded-md border border-[#E8E1D3] space-y-3">
              <h3 className="font-editorial text-lg text-dark-brown">Looking for Specific Support?</h3>
              <ul className="text-xs font-sans space-y-2 text-dark-brown/80">
                <li>
                  <Link to="/track-order" className="hover:text-burgundy flex items-center gap-1.5 transition-colors">
                    <span className="w-1.5 h-1.5 rounded-full bg-burgundy" />
                    <span>Track an Existing Order with Order Reference</span>
                  </Link>
                </li>
                <li>
                  <Link to="/trade" className="hover:text-burgundy flex items-center gap-1.5 transition-colors">
                    <span className="w-1.5 h-1.5 rounded-full bg-burgundy" />
                    <span>Architect & Interior Designer Trade Applications</span>
                  </Link>
                </li>
                <li>
                  <Link to="/returns" className="hover:text-burgundy flex items-center gap-1.5 transition-colors">
                    <span className="w-1.5 h-1.5 rounded-full bg-burgundy" />
                    <span>30-Day Inspection & Exchange Policy</span>
                  </Link>
                </li>
                <li>
                  <Link to="/faqs" className="hover:text-burgundy flex items-center gap-1.5 transition-colors">
                    <span className="w-1.5 h-1.5 rounded-full bg-burgundy" />
                    <span>Frequently Asked Questions & Hanging Guidelines</span>
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          {/* Right Column: Interactive Contact Form */}
          <div className="lg:col-span-7">
            <div className="bg-white p-6 sm:p-10 rounded-md border border-[#E8E1D3] shadow-xs">
              <h2 className="font-editorial text-2xl sm:text-3xl text-dark-brown mb-2">
                Send an Inquiry
              </h2>
              <p className="text-xs text-dark-brown/60 font-sans mb-8">
                Please provide details regarding your inquiry. For custom dimensions, include target wall size.
              </p>

              {submitted ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="p-8 text-center bg-cream/50 rounded-sm border border-burgundy/20 space-y-4"
                >
                  <div className="w-14 h-14 rounded-full bg-burgundy/10 text-burgundy mx-auto flex items-center justify-center">
                    <CheckCircle2 className="w-8 h-8 text-gold" />
                  </div>
                  <h3 className="font-editorial text-2xl text-dark-brown">Message Dispatched</h3>
                  <p className="text-xs text-dark-brown/70 font-sans max-w-md mx-auto leading-relaxed">
                    Thank you, {formData.name}. Your note has been registered with our atelier support desk. A representative will contact you at {formData.email} shortly.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setSubmitted(false);
                      setFormData({ name: '', email: '', phone: '', subject: 'Collector Consultation', message: '' });
                    }}
                    className="btn-burgundy text-xs uppercase tracking-[0.18em] py-3 px-6 font-semibold"
                  >
                    Send Another Inquiry
                  </button>
                </motion.div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div className="space-y-1.5">
                      <label className="text-[11px] uppercase tracking-[0.2em] text-dark-brown/80 font-sans font-semibold">
                        Your Full Name *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Julian Montgomery"
                        value={formData.name}
                        onChange={e => setFormData({ ...formData, name: e.target.value })}
                        className="w-full px-4 py-3 rounded-xs border border-[#E0D7C6] bg-cream/40 text-dark-brown text-sm font-sans focus:outline-none focus:border-burgundy focus:ring-1 focus:ring-burgundy transition-all"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[11px] uppercase tracking-[0.2em] text-dark-brown/80 font-sans font-semibold">
                        Email Address *
                      </label>
                      <input
                        type="email"
                        required
                        placeholder="julian@residence.com"
                        value={formData.email}
                        onChange={e => setFormData({ ...formData, email: e.target.value })}
                        className="w-full px-4 py-3 rounded-xs border border-[#E0D7C6] bg-cream/40 text-dark-brown text-sm font-sans focus:outline-none focus:border-burgundy focus:ring-1 focus:ring-burgundy transition-all"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div className="space-y-1.5">
                      <label className="text-[11px] uppercase tracking-[0.2em] text-dark-brown/80 font-sans font-semibold">
                        Contact Telephone (Optional)
                      </label>
                      <input
                        type="tel"
                        placeholder="+1 (555) 012-3456"
                        value={formData.phone}
                        onChange={e => setFormData({ ...formData, phone: e.target.value })}
                        className="w-full px-4 py-3 rounded-xs border border-[#E0D7C6] bg-cream/40 text-dark-brown text-sm font-sans focus:outline-none focus:border-burgundy focus:ring-1 focus:ring-burgundy transition-all"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[11px] uppercase tracking-[0.2em] text-dark-brown/80 font-sans font-semibold">
                        Inquiry Nature
                      </label>
                      <AtelierSelect
                        value={formData.subject}
                        onValueChange={val => setFormData({ ...formData, subject: val })}
                        className="w-full h-11 px-3.5 rounded-xs border border-[#E0D7C6] bg-cream/40 text-dark-brown text-sm font-sans focus:border-burgundy focus:ring-1 focus:ring-burgundy"
                        options={[
                          { value: 'Collector Consultation', label: 'Collector Consultation' },
                          { value: 'Bespoke CAD Commission', label: 'Bespoke CAD / Custom Sizing' },
                          { value: 'Trade & B2B Specification', label: 'Trade / Architectural Specification' },
                          { value: 'Existing Order Inquiries', label: 'Order Status / Shipping Assistance' },
                          { value: 'Press & Gallery Inquiries', label: 'Press & Exhibition Collaborations' },
                        ]}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] uppercase tracking-[0.2em] text-dark-brown/80 font-sans font-semibold">
                      Your Message or Project Details *
                    </label>
                    <textarea
                      rows={5}
                      required
                      placeholder="Describe your room dimensions, desired finish (Warm Gold, Antique Brass, Corten, Stainless), or specific questions regarding hanging and lead times..."
                      value={formData.message}
                      onChange={e => setFormData({ ...formData, message: e.target.value })}
                      className="w-full px-4 py-3 rounded-xs border border-[#E0D7C6] bg-cream/40 text-dark-brown text-sm font-sans focus:outline-none focus:border-burgundy focus:ring-1 focus:ring-burgundy transition-all resize-y"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full btn-burgundy text-xs uppercase tracking-[0.24em] py-4 font-semibold flex items-center justify-center gap-2 cursor-pointer shadow-sm hover:shadow-md transition-all"
                  >
                    {isSubmitting ? (
                      <span>Sending Message…</span>
                    ) : (
                      <>
                        <Send className="w-4 h-4 text-gold" />
                        <span>Send Message to Concierge</span>
                      </>
                    )}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
