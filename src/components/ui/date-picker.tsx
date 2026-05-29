import * as React from "react";
import { format, parse, isValid } from "date-fns";
import { fr } from "date-fns/locale";
import { CalendarIcon, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export interface DatePickerProps {
  /** ISO date string yyyy-MM-dd (or empty) */
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
  min?: string;
  max?: string;
  clearable?: boolean;
  size?: "default" | "sm";
  align?: "start" | "center" | "end";
}

function parseISO(v?: string): Date | undefined {
  if (!v) return undefined;
  const d = parse(v, "yyyy-MM-dd", new Date());
  return isValid(d) ? d : undefined;
}

function toISO(d?: Date): string {
  if (!d || !isValid(d)) return "";
  return format(d, "yyyy-MM-dd");
}

export function DatePicker({
  value,
  onChange,
  placeholder = "Choisir une date",
  disabled,
  className,
  id,
  min,
  max,
  clearable = true,
  size = "default",
  align = "start",
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const date = parseISO(value);
  const minDate = parseISO(min);
  const maxDate = parseISO(max);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            "w-full justify-start text-left font-normal",
            size === "sm" && "h-8 text-xs",
            !date && "text-muted-foreground",
            className
          )}
        >
          <CalendarIcon className={cn("mr-2 h-4 w-4 opacity-60", size === "sm" && "h-3.5 w-3.5")} />
          <span className="flex-1 truncate">
            {date ? format(date, "dd/MM/yyyy", { locale: fr }) : placeholder}
          </span>
          {clearable && date && !disabled && (
            <span
              role="button"
              tabIndex={-1}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onChange?.("");
              }}
              className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded hover:bg-muted"
            >
              <X className="h-3 w-3" />
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 z-50 bg-popover" align={align}>
        <Calendar
          mode="single"
          selected={date}
          onSelect={(d) => {
            onChange?.(toISO(d ?? undefined));
            if (d) setOpen(false);
          }}
          defaultMonth={date}
          locale={fr}
          disabled={(d) => {
            if (minDate && d < minDate) return true;
            if (maxDate && d > maxDate) return true;
            return false;
          }}
          initialFocus
          captionLayout="dropdown"
          startMonth={new Date(1925, 0)}
          endMonth={new Date(new Date().getFullYear() + 10, 11)}
          className={cn("p-3 pointer-events-auto")}
        />
      </PopoverContent>
    </Popover>
  );
}

export default DatePicker;
