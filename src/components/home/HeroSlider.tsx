import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import { useCatalog, DEFAULT_HERO_SLIDES } from '@/lib/catalogContext';

const AUTOPLAY_INTERVAL = 6000; // 6 seconds

export function HeroSlider() {
  const { homepageSettings } = useCatalog();
  const slides = (homepageSettings?.heroSlides && homepageSettings.heroSlides.length > 0)
    ? homepageSettings.heroSlides
    : DEFAULT_HERO_SLIDES;

  const [currentIdx, setCurrentIdx] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const requestRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);

  const safeIdx = currentIdx < slides.length ? currentIdx : 0;

  const nextSlide = useCallback(() => {
    setCurrentIdx(prev => (prev + 1) % slides.length);
    setProgress(0);
    startTimeRef.current = null;
  }, [slides.length]);

  const prevSlide = useCallback(() => {
    setCurrentIdx(prev => (prev - 1 + slides.length) % slides.length);
    setProgress(0);
    startTimeRef.current = null;
  }, [slides.length]);

  // Smooth 60fps progress bar animation & timer
  useEffect(() => {
    if (isPaused) {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      return;
    }

    const animateProgress = (timestamp: number) => {
      if (!startTimeRef.current) startTimeRef.current = timestamp;
      const elapsed = timestamp - startTimeRef.current;
      const pct = Math.min((elapsed / AUTOPLAY_INTERVAL) * 100, 100);
      setProgress(pct);

      if (elapsed >= AUTOPLAY_INTERVAL) {
        nextSlide();
      } else {
        requestRef.current = requestAnimationFrame(animateProgress);
      }
    };

    requestRef.current = requestAnimationFrame(animateProgress);

    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [safeIdx, isPaused, nextSlide]);

  const activeSlide = slides[safeIdx] || slides[0] || DEFAULT_HERO_SLIDES[0];

  return (
    <section 
      className="relative bg-cream border-b border-[#EBE4D6] overflow-hidden"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => {
        setIsPaused(false);
        startTimeRef.current = null;
      }}
    >
      <div className="w-full grid grid-cols-1 lg:grid-cols-12 min-h-[580px] lg:min-h-[660px] xl:min-h-[720px] items-stretch">
        
        {/* LEFT COLUMN: Editorial Typography & Navigation */}
        <div className="lg:col-span-6 flex flex-col justify-center px-6 sm:px-10 lg:px-14 xl:px-20 py-12 lg:py-20 z-10">
          <div className="max-w-xl">
            
            {/* Editorial Kicker */}
            <p className="text-[10px] sm:text-[11px] uppercase tracking-[0.28em] font-sans text-burgundy font-semibold mb-4 sm:mb-6">
              Curated Contemporary Art
            </p>

            {/* Main Headline - Exact Reference Typography */}
            <h1 className="font-editorial text-5xl sm:text-6xl lg:text-7xl xl:text-[80px] text-dark-brown font-normal leading-[1.04] tracking-tight mb-5 sm:mb-6">
              Art that<br />
              defines<br />
              your space
            </h1>

            {/* Editorial Subtitle */}
            <p className="text-xs sm:text-sm lg:text-[15px] text-dark-brown/80 leading-relaxed font-sans max-w-lg mb-8 sm:mb-10">
              Curated wall art and statement pieces designed to bring character, warmth and sophistication to modern interiors.
            </p>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 sm:gap-6 mb-10 sm:mb-14">
              <Link
                to="/shop/wall-art"
                className="inline-flex items-center justify-center gap-2 px-7 py-4 rounded-[2px] bg-burgundy hover:bg-burgundy-hover text-cream text-xs uppercase tracking-[0.22em] font-sans font-semibold transition-all duration-300 shadow-xs border border-transparent hover:border-dusty-pink text-center"
              >
                <span>SHOP WALL ART</span>
                <ArrowRight className="w-3.5 h-3.5 text-dusty-pink" />
              </Link>

              <Link
                to="/shop"
                className="group inline-flex items-center justify-center sm:justify-start gap-2 text-xs uppercase tracking-[0.22em] font-sans font-semibold text-dark-brown hover:text-burgundy transition-colors py-2"
              >
                <span>EXPLORE COLLECTIONS</span>
                <ArrowRight className="w-3.5 h-3.5 text-gold transition-transform duration-300 group-hover:translate-x-1" />
              </Link>
            </div>

            {/* Minimalist Progress Bar & Numerical Counter */}
            <div className="pt-6 border-t border-[#EBE4D6] flex items-center justify-between sm:justify-start gap-6">
              
              {/* Numerical Index (e.g. 01 · 04) */}
              <div className="flex items-center gap-1.5 font-mono text-xs tracking-wider">
                <span className="font-semibold text-dark-brown">
                  {String(currentIdx + 1).padStart(2, '0')}
                </span>
                <span className="text-dark-brown/40">·</span>
                <span className="text-dark-brown/50">
                  {String(slides.length).padStart(2, '0')}
                </span>
              </div>

              {/* Animated Gold Progress Bar */}
              <div 
                className="w-24 sm:w-36 h-[2px] bg-[#EBE4D6] rounded-full overflow-hidden relative"
                title={`${Math.round(progress)}% to next slide`}
              >
                <div 
                  className="h-full bg-gold transition-all duration-75 ease-linear rounded-full"
                  style={{ width: `${progress}%` }}
                />
              </div>

              {/* Arrow Controls */}
              <div className="flex items-center gap-1.5 ml-auto sm:ml-4">
                <button
                  type="button"
                  onClick={prevSlide}
                  aria-label="Previous slide"
                  className="w-8 h-8 rounded-full border border-[#EBE4D6] bg-white/80 hover:bg-white text-dark-brown hover:text-burgundy flex items-center justify-center transition-all cursor-pointer shadow-2xs hover:scale-105"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={nextSlide}
                  aria-label="Next slide"
                  className="w-8 h-8 rounded-full border border-[#EBE4D6] bg-white/80 hover:bg-white text-dark-brown hover:text-burgundy flex items-center justify-center transition-all cursor-pointer shadow-2xs hover:scale-105"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

            </div>

          </div>
        </div>

        {/* RIGHT COLUMN: Full-Bleed Architectural Slider */}
        <div className="lg:col-span-6 relative overflow-hidden bg-[#EFE8DD] min-h-[420px] sm:min-h-[500px] lg:min-h-full">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeSlide.id}
              initial={{ opacity: 0, scale: 1.03 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.99 }}
              transition={{ duration: 0.85, ease: [0.25, 1, 0.5, 1] }}
              className="absolute inset-0 w-full h-full"
            >
              <img
                src={activeSlide.image}
                alt={`${activeSlide.series} - ${activeSlide.location}`}
                className="w-full h-full object-cover object-center"
                loading="eager"
              />
              
              {/* Subtle Ambient Grain & Vignette */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent pointer-events-none" />
              <div className="absolute inset-0 bg-radial from-transparent to-black/10 pointer-events-none" />
            </motion.div>
          </AnimatePresence>

          {/* Floating Subtle Series Pill Badge at Bottom-Right (Exact Reference Style) */}
          <div className="absolute bottom-5 right-5 sm:bottom-7 sm:right-7 z-20">
            <Link
              to={activeSlide.artworkLink}
              className="group/badge inline-flex items-center gap-2.5 px-4 py-2.5 rounded-[2px] bg-white/92 hover:bg-white backdrop-blur-md border border-[#EBE4D6] shadow-xs transition-all duration-300 cursor-pointer"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-gold group-hover/badge:scale-125 transition-transform" />
              <span className="text-[10px] sm:text-[11px] uppercase tracking-[0.24em] font-sans text-dark-brown font-medium">
                {activeSlide.series}
              </span>
              <ArrowRight className="w-3 h-3 text-burgundy opacity-0 -translate-x-1 group-hover/badge:opacity-100 group-hover/badge:translate-x-0 transition-all duration-200" />
            </Link>
          </div>

          {/* Subtle Slide Indicators at Top-Right */}
          <div className="absolute top-5 right-5 z-20 hidden sm:flex items-center gap-1.5">
            {slides.map((s, idx) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  setCurrentIdx(idx);
                  setProgress(0);
                  startTimeRef.current = null;
                }}
                className={`transition-all duration-300 cursor-pointer rounded-full ${
                  safeIdx === idx
                    ? 'w-6 h-1.5 bg-gold'
                    : 'w-1.5 h-1.5 bg-white/60 hover:bg-white'
                }`}
                aria-label={`Go to slide ${idx + 1}`}
              />
            ))}
          </div>

        </div>

      </div>
    </section>
  );
}
