import { createFileRoute, Link } from "@tanstack/react-router";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { CalendarDays, ChevronLeft, ChevronRight, Plus, Clock, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMemo, useState } from "react";
import { useErp } from "@/lib/erpStore";
import { useAuth } from "@/lib/auth";
import { Can } from "@/components/Can";
import { toast } from "sonner";
import type { CalEvent } from "@/lib/types";

export const Route = createFileRoute("/calendar/")({
  head: () => ({
    meta: [
      { title: "Calendrier — CRM" },
      { name: "description", content: "Calendrier des rendez-vous, rappels et signatures." },
    ],
  }),
  component: CalendarPage,
});

const monthName = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
const dayShort = ["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"];
const dayLong = ["Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi","Dimanche"];

const typeColor: Record<string, string> = {
  rdv: "bg-info/15 text-info border-l-2 border-info",
  rappel: "bg-warning/15 text-warning-foreground border-l-2 border-warning",
  signature: "bg-success/15 text-success border-l-2 border-success",
};
const typeLabel: Record<string, string> = { rdv: "Rendez-vous", rappel: "Rappel", signature: "Signature" };

type ViewMode = "mois" | "semaine" | "jour";

function pad(n: number) { return String(n).padStart(2, "0"); }
function ymd(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function startOfWeek(d: Date) {
  const x = new Date(d);
  const offset = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - offset);
  x.setHours(0, 0, 0, 0);
  return x;
}
function frDate(d: Date) { return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`; }

function CalendarPage() {
  const auth = useAuth();
  const isAdmin = auth.user?.role === "Administrateur";
  const canDeleteEvent = auth.hasPermission("calendar.event.delete");
  const today = new Date();
  const [view, setView] = useState<ViewMode>("mois");
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), today.getDate()));
  const { events, saveEvent, deleteEvent } = useErp();
  const safeDelete = (id: string) => { if (!canDeleteEvent) { toast.error("Action non autorisée"); return; } return deleteEvent(id); };

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalEvent[]>();
    for (const e of events) {
      const list = map.get(e.date) ?? [];
      list.push(e);
      map.set(e.date, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.time.localeCompare(b.time));
    return map;
  }, [events]);
  const eventsFor = (d: Date) => eventsByDay.get(ymd(d)) ?? [];

  function navigate(direction: -1 | 1) {
    const d = new Date(cursor);
    if (view === "mois") d.setMonth(d.getMonth() + direction);
    else if (view === "semaine") d.setDate(d.getDate() + direction * 7);
    else d.setDate(d.getDate() + direction);
    setCursor(d);
  }

  const headerLabel = useMemo(() => {
    if (view === "mois") return `${monthName[cursor.getMonth()]} ${cursor.getFullYear()}`;
    if (view === "semaine") {
      const s = startOfWeek(cursor);
      const e = new Date(s); e.setDate(s.getDate() + 6);
      return `Semaine du ${frDate(s)} au ${frDate(e)}`;
    }
    return `${dayLong[(cursor.getDay() + 6) % 7]} ${frDate(cursor)}`;
  }, [view, cursor]);

  const navLabel = view === "mois" ? "mois" : view === "semaine" ? "semaine" : "jour";

  return (
    <AppLayout skeleton="list">
      <PageHeader
        title="Calendrier"
        description={`${events.length} événement(s) — Rendez-vous, rappels et signatures`}
        icon={<CalendarDays className="h-5 w-5" />}
        actions={<Can perm="calendar.event.add"><NewEventDialog defaultDate={ymd(cursor)} onSave={saveEvent} /></Can>}
      />

      <Card className="mt-6 shadow-elegant overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-border gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => navigate(-1)} aria-label={`${navLabel} précédent`}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setCursor(new Date(today.getFullYear(), today.getMonth(), today.getDate()))}>
              Aujourd'hui
            </Button>
            <Button variant="outline" size="icon" onClick={() => navigate(1)} aria-label={`${navLabel} suivant`}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <h2 className="text-base sm:text-lg font-semibold capitalize">{headerLabel}</h2>

          <div className="flex items-center gap-3 flex-wrap">
            <div className="hidden md:flex gap-1 text-xs">
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-info" />RDV</span>
              <span className="inline-flex items-center gap-1.5 ml-2"><span className="h-2 w-2 rounded-full bg-warning" />Rappel</span>
              <span className="inline-flex items-center gap-1.5 ml-2"><span className="h-2 w-2 rounded-full bg-success" />Signature</span>
            </div>
            <div className="inline-flex rounded-md border border-border bg-muted/30 p-0.5">
              {(["mois","semaine","jour"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`px-3 py-1 text-xs font-medium rounded capitalize transition-colors ${
                    view === v ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
        </div>

        {view === "mois" && <MonthView cursor={cursor} today={today} eventsFor={eventsFor} onDelete={safeDelete} canDelete={canDeleteEvent} />}
        {view === "semaine" && <WeekView cursor={cursor} today={today} eventsFor={eventsFor} onDelete={safeDelete} canDelete={canDeleteEvent} />}
        {view === "jour" && <DayView cursor={cursor} eventsFor={eventsFor} onDelete={safeDelete} canDelete={canDeleteEvent} />}
      </Card>
    </AppLayout>
  );
}

function NewEventDialog({ defaultDate, onSave }: { defaultDate: string; onSave: (e: Partial<CalEvent>) => Promise<void> | void }) {
  const auth = useAuth();
  const me = auth.user?.username ?? "";
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(defaultDate);
  const [time, setTime] = useState("09:00");
  const [type, setType] = useState<CalEvent["type"]>("rdv");
  const [agent, setAgent] = useState(me);

  const submit = async () => {
    if (!title.trim()) { toast.error("Titre requis"); return; }
    try {
      await onSave({ title: title.trim(), date, time, type, agent });
      toast.success("Événement ajouté");
      setOpen(false);
      setTitle(""); setTime("09:00"); setType("rdv");
    } catch (e) {
      toast.error("Échec", { description: e instanceof Error ? e.message : "" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90">
          <Plus className="h-4 w-4 mr-1.5" />Nouvel événement
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nouvel événement</DialogTitle>
          <DialogDescription>Planifiez un RDV, rappel ou signature.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5"><Label>Titre</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: RDV M. Dupont" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Date</Label><DatePicker value={date} onChange={setDate} /></div>
            <div className="space-y-1.5"><Label>Heure</Label><Input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as CalEvent["type"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="rdv">Rendez-vous</SelectItem>
                  <SelectItem value="rappel">Rappel</SelectItem>
                  <SelectItem value="signature">Signature</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Agent</Label><Input value={agent} onChange={(e) => setAgent(e.target.value)} disabled={auth.user?.role !== "Administrateur"} /></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
          <Button onClick={submit}>Créer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MonthView({ cursor, today, eventsFor, onDelete, canDelete }: { cursor: Date; today: Date; eventsFor: (d: Date) => CalEvent[]; onDelete: (id: string) => void | Promise<void>; canDelete?: boolean }) {
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDay = new Date(year, month, 1);
  const startOffset = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [
    ...Array(startOffset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1)),
  ];
  while (cells.length % 7) cells.push(null);

  return (
    <>
      <div className="grid grid-cols-7 border-b border-border bg-muted/30">
        {dayShort.map((d) => (
          <div key={d} className="px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider text-center">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((d, i) => {
          const isToday = d && ymd(d) === ymd(today);
          const events = d ? eventsFor(d) : [];
          const visible = events.slice(0, 3);
          const overflow = events.length - visible.length;
          return (
            <div key={i} className={`min-h-[110px] border-r border-b border-border p-1.5 ${d ? "" : "bg-muted/20"} ${isToday ? "bg-primary/5" : ""}`}>
              {d && (
                <>
                  <Link
                    to="/calendar/$date"
                    params={{ date: ymd(d) }}
                    className="block hover:bg-accent/40 -m-1.5 p-1.5 rounded transition-colors cursor-pointer"
                    title="Voir tous les événements de ce jour"
                  >
                    <div className={`text-xs font-medium mb-1 ${isToday ? "inline-flex h-6 w-6 rounded-full bg-primary text-primary-foreground items-center justify-center" : "text-muted-foreground"}`}>
                      {d.getDate()}
                    </div>
                    <div className="space-y-1">
                      {visible.map((e) => (
                        <div key={e.id} className={`text-[10px] px-1.5 py-1 rounded truncate ${typeColor[e.type]} group flex items-center justify-between gap-1`}>
                          <span><span className="font-semibold">{e.time}</span> {e.title}</span>
                          {canDelete && <button onClick={(ev) => { ev.preventDefault(); ev.stopPropagation(); onDelete(e.id); }} className="opacity-0 group-hover:opacity-70 hover:opacity-100" aria-label="Supprimer"><Trash2 className="h-3 w-3" /></button>}
                        </div>
                      ))}
                      {overflow > 0 && (
                        <div className="text-[10px] text-muted-foreground px-1.5">+{overflow} autre(s)</div>
                      )}
                    </div>
                  </Link>
                </>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

function WeekView({ cursor, today, eventsFor, onDelete, canDelete }: { cursor: Date; today: Date; eventsFor: (d: Date) => CalEvent[]; onDelete: (id: string) => void | Promise<void>; canDelete?: boolean }) {
  const start = startOfWeek(cursor);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start); d.setDate(start.getDate() + i); return d;
  });
  return (
    <div className="grid grid-cols-7">
      {days.map((d, i) => {
        const isToday = ymd(d) === ymd(today);
        const events = eventsFor(d);
        const visible = events.slice(0, 6);
        const overflow = events.length - visible.length;
        return (
          <div key={i} className={`min-h-[420px] border-r border-border p-2 ${isToday ? "bg-primary/5" : ""}`}>
            <Link
              to="/calendar/$date"
              params={{ date: ymd(d) }}
              className="flex items-baseline justify-between mb-2 hover:bg-accent/40 -mx-1 px-1 py-1 rounded transition-colors"
              title="Voir tous les événements de ce jour"
            >
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{dayShort[i]}</div>
              <div className={`text-sm font-semibold ${isToday ? "inline-flex h-7 w-7 rounded-full bg-primary text-primary-foreground items-center justify-center" : ""}`}>
                {d.getDate()}
              </div>
            </Link>
            <div className="space-y-1">
              {visible.map((e) => (
                <div key={e.id} className={`text-[11px] px-2 py-1.5 rounded ${typeColor[e.type]} group`}>
                  <div className="flex items-center justify-between">
                    <div className="font-semibold">{e.time}</div>
                    {canDelete && <button onClick={() => onDelete(e.id)} className="opacity-0 group-hover:opacity-70 hover:opacity-100"><Trash2 className="h-3 w-3" /></button>}
                  </div>
                  <div className="truncate">{e.title}</div>
                </div>
              ))}
              {overflow > 0 && <OverflowPopover date={d} events={events} hiddenCount={overflow} onDelete={onDelete} canDelete={canDelete} />}
              {events.length === 0 && <div className="text-[11px] text-muted-foreground italic mt-2">Aucun événement</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DayView({ cursor, eventsFor, onDelete, canDelete }: { cursor: Date; eventsFor: (d: Date) => CalEvent[]; onDelete: (id: string) => void | Promise<void>; canDelete?: boolean }) {
  const events = eventsFor(cursor);
  const hours = Array.from({ length: 12 }, (_, i) => 8 + i);
  const grouped = new Map<number, CalEvent[]>();
  for (const e of events) {
    const h = parseInt(e.time.split(":")[0], 10);
    const list = grouped.get(h) ?? [];
    list.push(e);
    grouped.set(h, list);
  }
  return (
    <div className="divide-y divide-border">
      {hours.map((h) => {
        const list = grouped.get(h) ?? [];
        return (
          <div key={h} className="grid grid-cols-[80px_1fr] gap-3 px-4 py-3 hover:bg-muted/20">
            <div className="text-xs text-muted-foreground font-medium flex items-start gap-1.5 pt-1">
              <Clock className="h-3 w-3 mt-0.5" />{pad(h)}:00
            </div>
            <div className="space-y-1.5">
              {list.length === 0 ? (
                <div className="text-xs text-muted-foreground/60 italic">—</div>
              ) : list.map((e) => (
                <div key={e.id} className={`text-sm px-3 py-2 rounded ${typeColor[e.type]} group`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{e.time} — {e.title}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] uppercase tracking-wider opacity-70">{typeLabel[e.type]}</span>
                      {canDelete && <button onClick={() => onDelete(e.id)} className="opacity-50 hover:opacity-100"><Trash2 className="h-3.5 w-3.5" /></button>}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">Avec @{e.agent}</div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function OverflowPopover({ date, events, hiddenCount, onDelete, canDelete }: { date: Date; events: CalEvent[]; hiddenCount: number; onDelete: (id: string) => void | Promise<void>; canDelete?: boolean }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="text-[10px] font-medium text-primary hover:underline px-1.5 py-0.5">
          +{hiddenCount} en plus
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <div className="px-3 py-2 border-b border-border">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">{dayLong[(date.getDay() + 6) % 7]}</div>
          <div className="text-sm font-semibold">{frDate(date)}</div>
        </div>
        <div className="max-h-72 overflow-y-auto p-2 space-y-1">
          {events.map((e) => (
            <div key={e.id} className={`text-[11px] px-2 py-1.5 rounded ${typeColor[e.type]} group`}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">{e.time}</span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase opacity-70">{typeLabel[e.type]}</span>
                  {canDelete && <button onClick={() => onDelete(e.id)} className="opacity-50 hover:opacity-100"><Trash2 className="h-3 w-3" /></button>}
                </div>
              </div>
              <div className="truncate">{e.title}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">@{e.agent}</div>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
