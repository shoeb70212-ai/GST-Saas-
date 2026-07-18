import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { useEffect } from 'react';
import { cn } from '../../lib/utils';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string | React.ReactNode;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | 'full';
  variant?: 'dialog' | 'drawer';
  position?: 'right' | 'left' | 'bottom'; // For drawer variant
  className?: string;
  hideHeader?: boolean;
}

export function Modal({ 
  isOpen, 
  onClose, 
  title, 
  children, 
  size = 'md', 
  variant = 'dialog',
  position = 'right',
  className,
  hideHeader = false
}: ModalProps) {
  
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleEsc);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      window.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  const sizeClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
    '3xl': 'max-w-3xl',
    '4xl': 'max-w-4xl',
    full: 'max-w-none w-full h-full rounded-none',
  };

  const isDrawer = variant === 'drawer';

  // Animation variants
  const backdropVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1 }
  };

  const dialogVariants = {
    hidden: { opacity: 0, scale: 0.95, y: 10 },
    visible: { opacity: 1, scale: 1, y: 0, transition: { type: 'spring', damping: 25, stiffness: 300 } },
    exit: { opacity: 0, scale: 0.95, y: 10, transition: { duration: 0.2 } }
  };

  const getDrawerVariants = () => {
    if (position === 'bottom') {
      return {
        hidden: { y: '100%' },
        visible: { y: 0, transition: { type: 'spring', damping: 25, stiffness: 250 } },
        exit: { y: '100%', transition: { duration: 0.2 } }
      };
    }
    const xOffset = position === 'left' ? '-100%' : '100%';
    return {
      hidden: { x: xOffset },
      visible: { x: 0, transition: { type: 'spring', damping: 25, stiffness: 250 } },
      exit: { x: xOffset, transition: { duration: 0.2 } }
    };
  };

  const drawerVariants = getDrawerVariants();

  return (
    <AnimatePresence>
      {isOpen && (
        <div className={cn(
          "fixed inset-0 z-50 flex",
          isDrawer 
            ? (position === 'bottom' ? 'items-end' : position === 'left' ? 'justify-start' : 'justify-end') 
            : "items-center justify-center p-4 sm:p-6"
        )}>
          {/* Backdrop */}
          <motion.div
            variants={backdropVariants}
            initial="hidden"
            animate="visible"
            exit="hidden"
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={onClose}
          />
          
          {/* Content */}
          <motion.div
            variants={isDrawer ? drawerVariants : dialogVariants}
            initial="hidden"
            animate="visible"
            exit={isDrawer ? "exit" : "hidden"}
            className={cn(
              "relative bg-bg-surface flex flex-col shadow-2xl overflow-hidden",
              isDrawer && position !== 'bottom' ? "h-full" : "",
              isDrawer && position === 'bottom' ? "w-full rounded-t-2xl max-h-[90vh]" : "",
              isDrawer && position !== 'bottom' ? `w-full ${sizeClasses[size]}` : "",
              !isDrawer ? `w-full ${sizeClasses[size]} rounded-2xl max-h-full border border-border` : "",
              isDrawer && position === 'right' ? "border-l border-border" : "",
              isDrawer && position === 'left' ? "border-r border-border" : "",
              className
            )}
            onClick={(e) => e.stopPropagation()}
          >
            {!hideHeader && (title || onClose) && (
              <div className="flex items-center justify-between p-4 md:p-6 border-b border-border bg-bg-surface/90 backdrop-blur-md sticky top-0 z-10">
                {typeof title === 'string' ? (
                  <h2 className="text-xl font-bold text-text-primary">{title}</h2>
                ) : (
                  <div>{title}</div>
                )}
                <button
                  onClick={onClose}
                  className="p-2 -mr-2 rounded-full hover:bg-bg-sunken text-text-secondary hover:text-text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
                  aria-label="Close modal"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            )}
            <div className={cn("overflow-y-auto flex-1", !hideHeader ? "p-4 md:p-6" : "")}>
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
