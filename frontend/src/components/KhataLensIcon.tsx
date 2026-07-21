import { useEffect, useRef  } from "react";
import anime from 'animejs';

interface KhataLensIconProps {
  className?: string;
  size?: number;
  animate?: boolean;
}

export default function KhataLensIcon({ className = '', size = 24, animate = false }: KhataLensIconProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (animate && svgRef.current) {
      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (prefersReducedMotion) return;

      const elements = svgRef.current.querySelectorAll('line, circle');
      anime({
        targets: elements,
        strokeDashoffset: [anime.setDashoffset, 0],
        easing: 'easeInOutSine',
        duration: 1500,
        delay: function(_el, i) { return i * 150 },
        direction: 'alternate',
        loop: false
      });
    }
  }, [animate]);

  return (
    <div 
      className={`relative flex items-center justify-center ${className}`} 
      style={{ width: size, height: size, minWidth: size, minHeight: size }}
    >
      <svg 
        ref={svgRef}
        xmlns="http://www.w3.org/2000/svg" 
        viewBox="0 0 24 24" 
        width={size} 
        height={size}
        fill="none"
        className="drop-shadow-md khatalens-svg"
      >
        {/* Handle */}
        <line x1="17.5" y1="17.5" x2="22.5" y2="22.5" stroke="#964F2A" strokeWidth="3" strokeLinecap="round" className="drop-shadow-sm" />
        <line x1="17.5" y1="17.5" x2="22.5" y2="22.5" stroke="#B56A3A" strokeWidth="1.5" strokeLinecap="round" />
        
        {/* Glass Frame */}
        <circle cx="10.5" cy="10.5" r="9" fill="#FFFFFF" stroke="#B56A3A" strokeWidth="2.5" className="drop-shadow-sm" />
        <circle cx="10.5" cy="10.5" r="7.5" fill="none" stroke="#C67A4A" strokeWidth="0.5" opacity="0.5" />
        
        {/* Document Lines (Inside the glass) */}
        {/* Line 1 (Black) */}
        <line x1="4.5" y1="6" x2="14" y2="6" stroke="#141614" strokeWidth="1.2" strokeLinecap="round" />
        
        {/* Line 2 (Black) */}
        <line x1="4.5" y1="8.5" x2="11" y2="8.5" stroke="#141614" strokeWidth="1.2" strokeLinecap="round" />
        
        {/* Line 3 (Colored Highlights) */}
        <line x1="4.5" y1="11" x2="8.5" y2="11" stroke="#B56A3A" strokeWidth="1.2" strokeLinecap="round" />
        <line x1="9.5" y1="11" x2="15.5" y2="11" stroke="#A65D12" strokeWidth="1.2" strokeLinecap="round" />
        
        {/* Line 4 (Black) */}
        <line x1="4.5" y1="13.5" x2="13" y2="13.5" stroke="#141614" strokeWidth="1.2" strokeLinecap="round" />
        
        {/* Line 5 (Black, shorter) */}
        <line x1="4.5" y1="16" x2="9" y2="16" stroke="#141614" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    </div>
  );
}