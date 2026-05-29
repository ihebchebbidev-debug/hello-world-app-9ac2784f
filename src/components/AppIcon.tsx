import dashboard from "@/assets/icons/dashboard.png";
import pipeline from "@/assets/icons/pipeline.png";
import leads from "@/assets/icons/leads.png";
import tasks from "@/assets/icons/tasks.png";
import calendar from "@/assets/icons/calendar.png";
import notifications from "@/assets/icons/notifications.png";
import users from "@/assets/icons/users.png";
import roles from "@/assets/icons/roles.png";
import configuration from "@/assets/icons/configuration.png";
import documentation from "@/assets/icons/documentation.png";
import brand from "@/assets/icons/brand.png";

export const APP_ICONS = {
  dashboard,
  pipeline,
  leads,
  tasks,
  calendar,
  notifications,
  users,
  roles,
  configuration,
  documentation,
  brand,
} as const;

export type AppIconName = keyof typeof APP_ICONS;

export function AppIcon({
  name,
  size = 22,
  className = "",
  alt = "",
}: {
  name: AppIconName;
  size?: number;
  className?: string;
  alt?: string;
}) {
  return (
    <img
      src={APP_ICONS[name]}
      width={size}
      height={size}
      loading="lazy"
      alt={alt}
      aria-hidden={alt ? undefined : true}
      className={`object-contain shrink-0 select-none ${className}`}
      draggable={false}
    />
  );
}
