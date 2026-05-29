import { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  icon?: ReactNode;
  eyebrow?: string;
}

export function PageHeader({ title, description, actions, icon, eyebrow }: PageHeaderProps) {
  return (
    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-5 mb-2 border-b border-border">
      <div className="flex items-start gap-4 min-w-0 lg:flex-1">
        {icon && (
          <div className="h-12 w-12 rounded-xl bg-primary/10 text-primary border border-primary/20 flex items-center justify-center shrink-0 shadow-sm">
            {icon}
          </div>
        )}
        <div className="min-w-0 flex-1">
          {eyebrow && (
            <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground mb-1.5 font-medium">
              {eyebrow}
            </div>
          )}
          <h1 className="text-2xl md:text-[28px] font-semibold tracking-tight leading-tight">
            {title}
          </h1>
          {description && (
            <p className="text-sm text-muted-foreground mt-1.5 max-w-2xl">{description}</p>
          )}
        </div>
      </div>
      {actions && (
        <div className="flex items-center gap-2 flex-wrap lg:shrink-0 lg:justify-end w-full lg:w-auto">
          {actions}
        </div>
      )}
    </div>
  );
}
