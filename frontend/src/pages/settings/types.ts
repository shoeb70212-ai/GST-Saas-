import type { Variants } from 'framer-motion';

export type SettingsTab = 'profile' | 'company' | 'team' | 'automation' | 'security' | 'export';

export const tabSlide: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.25, ease: [0.22, 1, 0.36, 1] } },
  exit: { opacity: 0, y: -10, transition: { duration: 0.15 } },
};
