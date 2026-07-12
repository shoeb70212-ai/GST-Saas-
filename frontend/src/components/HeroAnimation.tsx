import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect } from 'react';
import { FileText, FileSpreadsheet } from 'lucide-react';

export default function HeroAnimation() {
  const [activeId, setActiveId] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveId((prev) => (prev + 1) % 100); 
    }, 3500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="relative w-full h-[450px] lg:h-[550px] flex items-center justify-center scale-90 sm:scale-100 mt-8 lg:mt-0">
      {/* Animated connection lines */}
      <div className="absolute top-1/2 left-0 w-full h-[3px] -translate-y-1/2 flex items-center justify-between px-16 z-0 hidden sm:flex">
        <motion.div 
          className="h-full w-2/5 bg-gradient-to-r from-transparent via-slate-300 to-transparent" 
          animate={{ backgroundPosition: ['200% 0', '-200% 0'] }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
        />
        <motion.div 
          className="h-full w-2/5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent" 
          animate={{ backgroundPosition: ['-200% 0', '200% 0'] }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear", delay: 1 }}
        />
      </div>

      <div className="relative flex items-center justify-between w-full max-w-3xl px-2 z-10 gap-4">
        
        {/* Step 1: Messy Invoices */}
        <div className="hidden sm:flex flex-col gap-3 relative z-10 items-center">
           <div className="bg-white/80 backdrop-blur px-3 py-1 rounded-full shadow-sm border border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Messy Bills</div>
           <div className="relative w-24 h-32">
             <AnimatePresence mode="popLayout">
               <motion.div 
                 key={`queue-${activeId}`}
                 initial={{ opacity: 0, x: -50, scale: 0.8, rotate: -5 }}
                 animate={{ opacity: 1, x: 0, scale: 1, rotate: 2 }}
                 exit={{ opacity: 0, x: 50, scale: 0.8, filter: "blur(4px)" }}
                 transition={{ duration: 0.8, type: "spring" }}
                 className="absolute inset-0 bg-white rounded-xl shadow-lg border border-slate-200 p-3 flex flex-col gap-2"
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
               </motion.div>
             </AnimatePresence>
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
          
          <img src="/favicon.png" alt="KhataLens" className="w-24 h-24 drop-shadow-[0_0_25px_rgba(232,80,10,0.8)] z-10 mb-6" />

          {/* Active Scanning Invoice */}
          <AnimatePresence mode="wait">
            <motion.div
              key={`scan-${activeId}`}
              initial={{ opacity: 0, y: -100, scale: 0.6, rotate: -5 }}
              animate={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
              exit={{ opacity: 0, y: 100, scale: 0.6, filter: "blur(10px)" }}
              transition={{ duration: 1.2, type: "spring", bounce: 0.3 }}
              className="absolute bottom-8 w-40 h-48 bg-white rounded-xl shadow-2xl p-4 overflow-hidden"
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
               <motion.div
                 animate={{ top: ['0%', '100%', '0%'] }}
                 transition={{ duration: 1.8, repeat: Infinity, ease: "linear" }}
                 className="absolute left-0 w-full h-[4px] bg-accent shadow-[0_0_15px_#E8500A] z-20 opacity-90"
               />
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Step 3: Extracted Data (Excel) */}
        <div className="hidden sm:flex flex-col gap-3 items-center relative z-10">
           <div className="bg-emerald-50 text-emerald-600 px-3 py-1 rounded-full shadow-sm border border-emerald-100 text-[11px] font-bold uppercase tracking-wider mb-2">Ready to File</div>
           <div className="w-56 bg-white rounded-2xl shadow-xl border border-slate-200 p-5 relative overflow-hidden">
             
             {/* Success Ping */}
             <motion.div 
                key={`ping-${activeId}`}
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: [0, 1, 0], scale: [0.5, 3, 4] }}
                transition={{ delay: 1.2, duration: 1 }}
                className="absolute top-5 right-5 w-5 h-5 rounded-full bg-emerald-400/20"
             />

             <div className="flex items-center gap-2 mb-6 border-b border-slate-100 pb-3 text-slate-800">
               <FileSpreadsheet className="w-5 h-5 text-emerald-500" />
               <span className="text-sm font-bold tracking-tight">Excel Sheet</span>
             </div>
             
             <div className="flex flex-col gap-3">
               {/* Excel Rows */}
               {[1, 2, 3].map((row) => (
                 <motion.div
                   key={`row-${activeId}-${row}`}
                   initial={{ opacity: 0, x: -30, height: 0 }}
                   animate={{ opacity: 1, x: 0, height: 32 }}
                   transition={{ delay: 1.2 + (row * 0.15), duration: 0.4, type: "spring" }}
                   className="w-full bg-slate-50 rounded border border-slate-200 flex items-center px-3 gap-3 shadow-sm hover:bg-emerald-50 hover:border-emerald-200 transition-colors"
                 >
                   <div className="w-2 h-2 rounded-sm bg-emerald-400" />
                   <div className="w-16 h-2 bg-slate-300 rounded" />
                   <div className="w-8 h-2 bg-slate-400 rounded ml-auto" />
                 </motion.div>
               ))}
             </div>
           </div>
        </div>

      </div>
    </div>
  );
}
