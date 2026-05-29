import emptyImg from "@/assets/empty-state.png";
import { ReactNode } from "react";

export function EmptyState({
  title = "Rien à afficher",
  description,
  action,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-6">
      <img
        src={emptyImg}
        width={384}
        height={288}
        alt=""
        aria-hidden
        className="w-64 h-auto opacity-90 mb-6 select-none"
        draggable={false}
        loading="lazy"
      />
      <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
      {description && (
        <p className="text-sm text-muted-foreground mt-1.5 max-w-sm">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
