import { useEffect, useRef, useCallback } from 'react';
import anime from 'animejs';

/**
 * Detects if user prefers reduced motion for accessibility.
 */
const prefersReducedMotion = (): boolean => {
  if (typeof window === 'undefined') return true;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
};

/**
 * useAnimeOnScroll - Triggers anime.js animation when element scrolls into view.
 * 
 * Uses IntersectionObserver (zero dependency) to trigger animations.
 * Respects `prefers-reduced-motion` for accessibility.
 * Fires once per element (no replay).
 * Cleans up `will-change` after animation completes.
 * 
 * @param animeConfig - anime.js animation config (without `targets`)
 * @param options - IntersectionObserver options
 */
export function useAnimeOnScroll(
  animeConfig: Omit<anime.AnimeParams, 'targets'>,
  options?: { threshold?: number; rootMargin?: string }
) {
  const ref = useRef<HTMLDivElement>(null);
  const hasAnimated = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || hasAnimated.current) return;

    // Accessibility: skip animations if user prefers reduced motion
    if (prefersReducedMotion()) {
      // Just show the element immediately at final state
      el.style.opacity = '1';
      el.style.transform = 'none';
      hasAnimated.current = true;
      return;
    }

    // Set initial state (hidden)
    el.style.opacity = '0';
    el.style.willChange = 'transform, opacity';

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasAnimated.current) {
          hasAnimated.current = true;
          observer.disconnect();

          anime({
            targets: el,
            opacity: [0, 1],
            ...animeConfig,
            complete: () => {
              // Clean up will-change for performance
              el.style.willChange = 'auto';
            }
          });
        }
      },
      {
        threshold: options?.threshold ?? 0.15,
        rootMargin: options?.rootMargin ?? '0px 0px -80px 0px'
      }
    );

    observer.observe(el);

    return () => observer.disconnect();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return ref;
}

/**
 * useAnimeTimeline - Creates an anime.js timeline that triggers on scroll.
 * Returns a ref for the container and a timeline ref to add animations to.
 */
export function useAnimeTimeline(
  options?: { threshold?: number; rootMargin?: string }
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<anime.AnimeTimelineInstance | null>(null);
  const hasAnimated = useRef(false);

  const addToTimeline = useCallback((params: anime.AnimeParams, offset?: string | number) => {
    // Store params for later execution
    if (!timelineRef.current) return;
    timelineRef.current.add(params, offset);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || hasAnimated.current) return;

    if (prefersReducedMotion()) {
      // Show everything immediately
      const children = el.querySelectorAll('[data-anime]');
      children.forEach((child) => {
        (child as HTMLElement).style.opacity = '1';
        (child as HTMLElement).style.transform = 'none';
      });
      hasAnimated.current = true;
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasAnimated.current) {
          hasAnimated.current = true;
          observer.disconnect();

          // Play the timeline
          if (timelineRef.current) {
            timelineRef.current.play();
          }
        }
      },
      {
        threshold: options?.threshold ?? 0.1,
        rootMargin: options?.rootMargin ?? '0px 0px -60px 0px'
      }
    );

    observer.observe(el);

    return () => observer.disconnect();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { containerRef, timelineRef, addToTimeline };
}

/**
 * useStaggerReveal - Reveals children with staggered animation on scroll.
 */
export function useStaggerReveal(
  selector: string = '[data-anime]',
  config?: {
    translateY?: number;
    duration?: number;
    staggerDelay?: number;
    easing?: string;
  }
) {
  const ref = useRef<HTMLDivElement>(null);
  const hasAnimated = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || hasAnimated.current) return;

    const children = el.querySelectorAll(selector);
    if (!children.length) return;

    if (prefersReducedMotion()) {
      children.forEach((child) => {
        (child as HTMLElement).style.opacity = '1';
        (child as HTMLElement).style.transform = 'none';
      });
      hasAnimated.current = true;
      return;
    }

    // Set initial hidden state
    children.forEach((child) => {
      (child as HTMLElement).style.opacity = '0';
      (child as HTMLElement).style.transform = `translateY(${config?.translateY ?? 30}px)`;
      (child as HTMLElement).style.willChange = 'transform, opacity';
    });

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasAnimated.current) {
          hasAnimated.current = true;
          observer.disconnect();

          anime({
            targets: children,
            opacity: [0, 1],
            translateY: [config?.translateY ?? 30, 0],
            duration: config?.duration ?? 700,
            delay: anime.stagger(config?.staggerDelay ?? 80),
            easing: config?.easing ?? 'easeOutCubic',
            complete: () => {
              children.forEach((child) => {
                (child as HTMLElement).style.willChange = 'auto';
              });
            }
          });
        }
      },
      { threshold: 0.1, rootMargin: '0px 0px -60px 0px' }
    );

    observer.observe(el);

    return () => observer.disconnect();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return ref;
}

/**
 * useCountUp - Animates a number counting up with elastic easing.
 */
export function useCountUp(target: number, duration: number = 2000) {
  const ref = useRef<HTMLSpanElement>(null);
  const hasAnimated = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || hasAnimated.current) return;

    if (prefersReducedMotion()) {
      el.textContent = String(target);
      hasAnimated.current = true;
      return;
    }

    el.textContent = '0';

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasAnimated.current) {
          hasAnimated.current = true;
          observer.disconnect();

          const obj = { count: 0 };
          anime({
            targets: obj,
            count: target,
            duration,
            easing: 'easeOutExpo',
            round: 1,
            update: () => {
              if (el) el.textContent = String(obj.count);
            }
          });
        }
      },
      { threshold: 0.3 }
    );

    observer.observe(el);

    return () => observer.disconnect();
  }, [target, duration]);

  return ref;
}
