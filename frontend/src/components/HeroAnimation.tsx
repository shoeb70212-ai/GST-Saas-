import { useState, useEffect, useRef } from 'react';
import { FileText, FileSpreadsheet } from 'lucide-react';
import KhataLensIcon from './KhataLensIcon';
import anime from 'animejs';

export default function HeroAnimation() {
  const containerRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<anime.AnimeTimelineInstance | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) {
      // Just show static elements
      const elements = containerRef.current.querySelectorAll('.anime-hide');
      elements.forEach(el => (el as HTMLElement).style.opacity = '1');
      return;
    }

    // Set initial states
    anime.set('.anime-line-bg1', { backgroundPosition: '200% 0' });
    anime.set('.anime-line-bg2', { backgroundPosition: '-200% 0' });
    
    // Background lines loop
    anime({
      targets: '.anime-line-bg1',
      backgroundPosition: ['200% 0', '-200% 0'],
      duration: 2000,
      loop: true,
      easing: 'linear'
    });
    
    anime({
      targets: '.anime-line-bg2',
      backgroundPosition: ['-200% 0', '200% 0'],
      duration: 2000,
      delay: 1000,
      loop: true,
      easing: 'linear'
    });

    // Laser loop
    anime({
      targets: '.anime-laser',
      top: ['0%', '100%', '0%'],
      duration: 1800,
      loop: true,
      easing: 'linear'
    });

    // Create main timeline loop
    const tl = anime.timeline({
      loop: true,
    });
    timelineRef.current = tl;

    // Phase 1: Messy Bills In
    tl.add({
      targets: '.anime-messy-bill',
      opacity: [0, 1],
      translateX: [-50, 0],
      scale: [0.8, 1],
      rotate: [-5, 2],
      duration: 800,
      easing: 'easeOutElastic(1, .8)'
    })
    // Phase 2: Scan In + Messy Bills Out
    .add({
      targets: '.anime-messy-bill',
      opacity: [1, 0],
      translateX: [0, 50],
      scale: [1, 0.8],
      duration: 500,
      easing: 'easeInQuad'
    }, '+=500')
    .add({
      targets: '.anime-scan-bill',
      opacity: [0, 1],
      translateY: [-100, 0],
      scale: [0.6, 1],
      rotate: [-5, 0],
      duration: 1200,
      easing: 'easeOutElastic(1, .8)'
    }, '-=300')
    // Phase 3: Ping + Rows In + Scan Out
    .add({
      targets: '.anime-scan-bill',
      opacity: [1, 0],
      translateY: [0, 100],
      scale: [1, 0.6],
      duration: 500,
      easing: 'easeInQuad'
    }, '+=800')
    .add({
      targets: '.anime-ping',
      opacity: [0, 1, 0],
      scale: [0.5, 3, 4],
      duration: 1000,
      easing: 'easeOutQuad'
    }, '-=200')
    .add({
      targets: '.anime-row',
      opacity: [0, 1],
      translateX: [-30, 0],
      height: [0, 32],
      duration: 400,
      delay: anime.stagger(150),
      easing: 'easeOutElastic(1, .8)'
    }, '-=800')
    // Reset for next loop
    .add({
      targets: '.anime-row',
      opacity: [1, 0],
      duration: 400,
      easing: 'easeInQuad'
    }, '+=1000');

    return () => {
      anime.remove('.anime-line-bg1');
      anime.remove('.anime-line-bg2');
      anime.remove('.anime-laser');
      tl.pause();
    };
  }, []);

  return (
    <div ref={containerRef} className="w-full relative overflow-hidden flex items-center justify-center py-12 px-4 min-h-[440px] bg-bg-surface bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]">
      
      {/* Background animated lines */}
      <div className="anime-line-bg1 absolute inset-0 opacity-[0.03] z-0" style={{ backgroundImage: 'repeating-linear-gradient(90deg, transparent, transparent 40px, #000 40px, #000 42px)' }} />
      <div className="anime-line-bg2 absolute inset-0 opacity-[0.03] z-0" style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 40px, #000 40px, #000 42px)' }} />

      <div className="relative flex items-center justify-between w-full max-w-3xl px-2 z-10 gap-4">
        
        {/* Step 1: Messy Invoices */}
        <div className="hidden sm:flex flex-col gap-3 relative z-10 items-center">
           <div className="bg-white/80 backdrop-blur px-3 py-1 rounded-full shadow-sm border border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Messy Bills</div>
           <div className="relative w-24 h-32">
               <div 
                 className="anime-messy-bill anime-hide opacity-0 absolute inset-0 bg-white rounded-xl shadow-lg border border-slate-200 p-3 flex flex-col gap-2"
               >
                 <div className="flex justify-between items-center">
                   <div className="w-8 h-2 bg-slate-300 rounded" />
                   <div className="w-4 h-2 bg-slate-200 rounded" />
                 </div>
                 <div className="w-3/4 h-1.5 bg-slate-200 rounded mt-2" />
                 <div className="w-1/2 h-1.5 bg-slate-200 rounded" />
                 <div className="w-full h-full bg-slate-50 rounded mt-auto flex items-center justify-center border border-dashed border-slate-200">
                   <FileText className="w-6 h-6 text-slate-300" />
                 </div>
               </div>
           </div>
        </div>

        {/* Step 2: AI Scanner */}
        <div className="relative w-64 h-80 bg-slate-900 rounded-3xl border border-slate-800 shadow-[0_20px_60px_rgba(0,0,0,0.4)] flex flex-col items-center justify-center overflow-hidden z-20 mx-auto sm:mx-0 shrink-0">
          <div className="absolute top-5 bg-slate-800/80 backdrop-blur px-4 py-1.5 rounded-full border border-slate-700/50 flex items-center gap-2 shadow-inner">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-accent"></span>
            </span>
            <div className="text-xs font-bold text-white tracking-wide">KhataLens AI</div>
          </div>
          
          <div className="z-10 mb-6 drop-shadow-[0_0_25px_rgba(232,80,10,0.8)]">
            <KhataLensIcon size={96} animate={true} />
          </div>

          {/* Active Scanning Invoice */}
            <div
              className="anime-scan-bill anime-hide opacity-0 absolute bottom-8 w-40 h-48 bg-white rounded-xl shadow-2xl p-4 overflow-hidden"
            >
               <div className="flex justify-between items-center mb-4">
                 <div className="w-12 h-3 bg-slate-300 rounded" />
                 <div className="w-8 h-3 bg-slate-200 rounded" />
               </div>
               <div className="w-full h-2 bg-slate-100 rounded mb-2" />
               <div className="w-full h-2 bg-slate-100 rounded mb-2" />
               <div className="w-4/5 h-2 bg-slate-100 rounded mb-6" />
               
               <div className="w-full border-t-2 border-dashed border-slate-200 my-3" />
               
               <div className="flex justify-between items-center mb-2">
                 <div className="w-14 h-2 bg-slate-300 rounded" />
                 <div className="w-10 h-2 bg-slate-300 rounded" />
               </div>
               
               {/* Glowing Laser */}
               <div
                 className="anime-laser absolute left-0 w-full h-[4px] bg-accent shadow-[0_0_15px_#E8500A] z-20 opacity-90 top-0"
               />
            </div>
        </div>

        {/* Step 3: Extracted Data (Excel) */}
        <div className="hidden sm:flex flex-col gap-3 items-center relative z-10">
           <div className="bg-emerald-50 text-emerald-600 px-3 py-1 rounded-full shadow-sm border border-emerald-100 text-[11px] font-bold uppercase tracking-wider mb-2">Ready to File</div>
           <div className="w-56 bg-white rounded-2xl shadow-xl border border-slate-200 p-5 relative overflow-hidden">
             
             {/* Success Ping */}
             <div 
                className="anime-ping anime-hide opacity-0 absolute top-5 right-5 w-5 h-5 rounded-full bg-emerald-400/20"
             />

             <div className="flex items-center gap-2 mb-6 border-b border-slate-100 pb-3 text-slate-800">
               <FileSpreadsheet className="w-5 h-5 text-emerald-500" />
               <span className="text-sm font-bold tracking-tight">Excel Sheet</span>
             </div>
             
             <div className="flex flex-col gap-3">
               {/* Excel Rows */}
               {[1, 2, 3].map((row) => (
                 <div
                   key={`row-${row}`}
                   className="anime-row anime-hide opacity-0 w-full bg-slate-50 rounded border border-slate-200 flex items-center px-3 gap-3 shadow-sm hover:bg-emerald-50 hover:border-emerald-200 transition-colors overflow-hidden"
                 >
                   <div className="w-2 h-2 rounded-sm bg-emerald-400" />
                   <div className="w-16 h-2 bg-slate-300 rounded" />
                   <div className="w-8 h-2 bg-slate-400 rounded ml-auto" />
                 </div>
               ))}
             </div>
           </div>
        </div>

      </div>
    </div>
  );
}
