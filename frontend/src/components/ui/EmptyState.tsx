import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';
import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
  compact?: boolean;
}

export function EmptyState({ 
  icon: Icon, 
  title, 
  description, 
  action, 
  className,
  compact = false
}: EmptyStateProps) {
  return (
    <div className={cn(
      "flex flex-col items-center justify-center text-center",
      compact ? "p-6" : "p-8 md:p-12 min-h-[300px]",
      "border-2 border-dashed border-border rounded-xl bg-bg-surface/50",
      className
    )}>
      <div className={cn(
        "rounded-full bg-bg-sunken flex items-center justify-center mb-4",
        compact ? "w-12 h-12" : "w-16 h-16"
      )}>
        <Icon className={cn(
          "text-text-disabled",
          compact ? "w-6 h-6" : "w-8 h-8"
        )} />
      </div>
      <h3 className={cn(
        "font-bold text-text-primary mb-1",
        compact ? "text-base" : "text-xl"
      )}>
        {title}
      </h3>
      <p className={cn(
        "text-text-secondary max-w-sm mx-auto",
        compact ? "text-xs mb-4" : "text-sm mb-6 leading-relaxed"
      )}>
        {description}
      </p>
      {action && (
        <div className="mt-auto">
          {action}
        </div>
      )}
    </div>
  );
}
