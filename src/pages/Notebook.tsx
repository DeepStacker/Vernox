import { useState } from 'react';
import { useCatalog, Topic } from '@/lib/catalogContext';
import { SiteHeader } from '@/components/shop/SiteHeader';
import { SiteFooter } from '@/components/shop/SiteFooter';
import { ArrowRight, BookOpen, Clock, Calendar, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import { useSeo } from '@/lib/seo';
export default function Notebook() {
  useSeo({ title: 'Notebook', noindex: true });
  const { topics } = useCatalog();
  const [selectedTopic, setSelectedTopic] = useState<Topic | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>('All');

  // Categories extraction
  const categories = ['All', ...Array.from(new Set(topics.map(t => t.category)))];

  const filteredTopics = activeCategory === 'All' 
    ? topics 
    : topics.filter(t => t.category === activeCategory);

  return (
    <div className="min-h-screen flex flex-col bg-background font-sans antialiased text-foreground">
      <SiteHeader />
      
      {/* HERO SECTION */}
      <section className="relative border-b border-oxblood/10 bg-card/25 overflow-hidden py-16 md:py-24">
        <div className="absolute inset-0 pointer-events-none opacity-40">
          <div className="absolute top-0 right-10 w-96 h-96 bg-oxblood/5 rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-10 w-[400px] h-[400px] bg-brass/10 rounded-full blur-3xl" />
        </div>
        <div className="relative max-w-4xl mx-auto px-6 text-center">
          <span className="text-[10px] uppercase tracking-[0.4em] text-oxblood font-semibold mb-4 inline-block">Atelier Journal</span>
          <h1 className="font-display text-5xl md:text-6xl text-oxblood-deep leading-none mb-6">
            The <span className="font-serif-italic text-gradient-brass">Notebook</span>
          </h1>
          <p className="text-muted-foreground text-base md:text-lg max-w-xl mx-auto font-serif-italic">
            Design guides, laser workshop technical notes, and creative thoughts on shaping metal.
          </p>
        </div>
      </section>

      {/* ARTICLES CONTAINER */}
      <section className="max-w-5xl mx-auto px-6 py-12 md:py-16 flex-1 w-full space-y-10">
        
        {/* Category Filters */}
        <div className="flex flex-wrap items-center justify-center gap-2 pb-4 border-b border-border/40">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-4 py-1.5 text-[10px] uppercase tracking-widest rounded-full border transition-all ${
                activeCategory === cat
                  ? 'bg-oxblood text-ivory border-oxblood shadow-soft'
                  : 'border-border/60 text-muted-foreground hover:border-oxblood/40 hover:text-foreground'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* TOPIC CARDS GRID */}
        {filteredTopics.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground text-sm border border-dashed border-border/60 rounded">
            No journal entries found in this collection yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {filteredTopics.map((topic, i) => (
              <motion.article 
                key={topic.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
                className="bg-card border border-border/55 rounded-sm p-6 flex flex-col justify-between hover:border-oxblood/35 hover:shadow-soft transition-all group"
              >
                <div>
                  <div className="flex items-center gap-4 text-[10px] uppercase tracking-wider text-muted-foreground mb-4 font-semibold">
                    <span className="text-brass">{topic.category}</span>
                    <span className="w-1 h-1 bg-border rounded-full" />
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {topic.readTime}</span>
                  </div>
                  
                  <h3 className="font-display text-2xl text-oxblood-deep group-hover:text-oxblood transition-colors mb-3 leading-tight">
                    {topic.title}
                  </h3>
                  
                  <p className="text-sm text-foreground/70 font-serif-italic line-clamp-3 mb-6">
                    {topic.content}
                  </p>
                </div>

                <div className="flex items-center justify-between border-t border-border/40 pt-4 mt-auto">
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1 font-mono">
                    <Calendar className="w-3 h-3" /> {topic.date}
                  </span>
                  
                  <button 
                    onClick={() => setSelectedTopic(topic)}
                    className="inline-flex items-center gap-1.5 text-xs text-oxblood font-semibold tracking-wide hover:gap-2.5 transition-all group-hover:text-oxblood-deep"
                  >
                    Read article <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </motion.article>
            ))}
          </div>
        )}
      </section>

      {/* ARTICLE READER MODAL */}
      <AnimatePresence>
        {selectedTopic && (
          <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.3 }}
              className="bg-card border border-border max-w-2xl w-full rounded-sm shadow-luxe overflow-hidden flex flex-col max-h-[85vh] noise-overlay"
            >
              {/* Modal Header */}
              <div className="px-6 py-4 border-b border-border/60 bg-muted/20 flex justify-between items-center">
                <div className="flex items-center gap-3 text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
                  <span className="text-brass">{selectedTopic.category}</span>
                  <span className="w-1 h-1 bg-border rounded-full" />
                  <span>{selectedTopic.readTime}</span>
                </div>
                <button 
                  onClick={() => setSelectedTopic(null)}
                  className="p-1 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Scroll Content */}
              <div className="p-6 md:p-8 space-y-6 overflow-y-auto flex-1">
                <div className="space-y-4">
                  <span className="text-xs font-mono text-muted-foreground block">{selectedTopic.date}</span>
                  <h2 className="font-display text-4xl text-oxblood-deep leading-tight">
                    {selectedTopic.title}
                  </h2>
                </div>
                
                <div className="w-12 h-0.5 bg-brass/60" />
                
                <p className="text-base text-foreground/80 leading-relaxed font-serif-italic whitespace-pre-wrap">
                  {selectedTopic.content}
                </p>
              </div>

              {/* Modal Footer */}
              <div className="px-6 py-4 border-t border-border/60 bg-muted/10 flex justify-end">
                <button 
                  onClick={() => setSelectedTopic(null)}
                  className="bg-oxblood text-ivory hover:bg-oxblood-deep px-6 py-2.5 rounded-full text-xs font-semibold shadow-soft transition"
                >
                  Close Article
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <SiteFooter />
    </div>
  );
}
