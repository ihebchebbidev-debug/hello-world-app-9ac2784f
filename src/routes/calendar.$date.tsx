import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { ArrowLeft, CalendarDays, ChevronLeft, ChevronRight, Clock, Trash2, User } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DatePicker } from "@/components/ui/date-picker";
import { useMemo } from "react";
import { useErp } from "@/lib/erpStore";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import type { CalEvent } from "@/lib/types";

export const Route = createFileRoute("/calendar/$date")({
  head: ({ params }) => ({
    meta: [
      { title: `Événements du ${params.date} — CRM` },
      { name: "description", content: "Tous les événements pour la date sélectionnée." },
    ],
  }),
  component: CalendarDayPage,
});

const dayLong = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
const monthName = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

const typeColor: Record<string, string> = {
  rdv: "bg-info/15 text-info border-l-4 border-info",
  rappel: "bg-warning/15 text-warning-foreground border-l-4 border-warning",
  signature: "bg-success/15 text-success border-l-4 border-success",
};
const typeLabel: Record<string, string> = { rdv: "Rendez-vous", rappel: "Rappel", signature: "Signature" };

function pad(n: number) { return String(n).padStart(2, "0"); }

function CalendarDayPage() {
  const { date } = useParams({ from: "/calendar/$date" });
  const { events, deleteEvent } = useErp();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const canDeleteEvent = hasPermission("calendar.event.delete");
  const safeDelete = (id: string) => {
    if (!canDeleteEvent) { toast.error("Action non autorisée"); return; }
    return deleteEvent(id);
  };

  const parsed = useMemo(() => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }, [date]);

  const dayEvents = useMemo<CalEvent[]>(() => {
    return events
      .filter((e) => e.date === date)
      .sort((a, b) => a.time.localeCompare(b.time));
  }, [events, date]);

  const headerLabel = parsed
    ? `${dayLong[parsed.getDay()]} ${pad(parsed.getDate())} ${monthName[parsed.getMonth()]} ${parsed.getFullYear()}`
    : date;

  const grouped = useMemo(() => {
    const buckets: Record<string, CalEvent[]> = { rdv: [], rappel: [], signature: [], autre: [] };
    for (const e of dayEvents) {
      (buckets[e.type] ?? buckets.autre).push(e);
    }
    return buckets;
  }, [dayEvents]);

  const shiftDay = (delta: number) => {
    const base = parsed ?? new Date();
    const d = new Date(base);
    d.setDate(d.getDate() + delta);
    const newDate = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    navigate({ to: "/calendar/$date", params: { date: newDate } });
  };

  const goToDate = (value: string) => {
    if (!value || value === date) return;
    navigate({ to: "/calendar/$date", params: { date: value } });
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <Button asChild variant="outline" size="sm">
            <Link to="/calendar">
              <ArrowLeft className="h-4 w-4 mr-1" />Retour au calendrier
            </Link>
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => shiftDay(-1)} aria-label="Jour précédent">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="w-44">
              <DatePicker value={date} onChange={goToDate} />
            </div>
            <Button variant="outline" size="icon" onClick={() => shiftDay(1)} aria-label="Jour suivant">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <PageHeader
          title={headerLabel}
          description={`${dayEvents.length} événement(s) pour cette date`}
          icon={<CalendarDays className="h-5 w-5" />}
        />

        {dayEvents.length === 0 ? (
          <Card className="p-10 text-center text-muted-foreground">
            <CalendarDays className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <div className="text-sm">Aucun événement prévu ce jour.</div>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {(["rdv", "rappel", "signature"] as const).map((type) => {
              const list = grouped[type];
              if (!list || list.length === 0) return null;
              return (
                <Card key={type} className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-sm">{typeLabel[type]}</h3>
                    <Badge variant="secondary">{list.length}</Badge>
                  </div>
                  <ul className="space-y-2">
                    {list.map((e) => (
                      <li key={e.id} className={`group rounded-md px-3 py-2 text-sm ${typeColor[e.type]}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 text-xs font-semibold">
                              <Clock className="h-3 w-3" />{e.time}
                            </div>
                            <div className="font-medium truncate mt-0.5">{e.title}</div>
                            {e.agent && (
                              <div className="flex items-center gap-1 text-[11px] text-muted-foreground mt-1">
                                <User className="h-3 w-3" />{e.agent}
                              </div>
                            )}
                          </div>
                          {canDeleteEvent && (
                            <button
                              onClick={() => safeDelete(e.id)}
                              className="opacity-0 group-hover:opacity-70 hover:opacity-100 transition-opacity"
                              aria-label="Supprimer"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
