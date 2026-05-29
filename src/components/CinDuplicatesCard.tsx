import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users } from "lucide-react";
import { api, API_ENABLED } from "@/lib/api";

type Match = {
  id: string;
  lastName?: string;
  firstName?: string;
  phone?: string;
  phone2?: string;
  cin?: string;
  status?: string;
  assignedTo?: string | null;
  createdAt?: string;
};

/**
 * Affiche les autres fiches partageant la même CIN (doublons autorisés).
 * Permet à l'utilisateur de voir toutes les "fiches doubles" d'une même personne.
 */
export function CinDuplicatesCard({ cin, currentId }: { cin?: string | null; currentId: string }) {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!API_ENABLED || !cin) { setMatches([]); return; }
    setLoading(true);
    api<{ matches: Match[] }>(`/prospects.php?check_duplicate=1&cin=${encodeURIComponent(cin)}`)
      .then((r) => setMatches((r.matches ?? []).filter((m) => m.id !== currentId)))
      .catch(() => setMatches([]))
      .finally(() => setLoading(false));
  }, [cin, currentId]);

  if (!cin) return null;
  if (!loading && matches.length === 0) return null;

  return (
    <Card className="shadow-elegant border-amber-300/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="h-4 w-4 text-amber-600" />
          Fiches doublons (même CIN)
          <Badge variant="secondary" className="ml-1">{matches.length}</Badge>
        </CardTitle>
        <CardDescription>
          D'autres fiches partagent la CIN <strong>{cin}</strong>. Ce sont des doublons autorisés —
          chaque fiche conserve ses propres informations.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {loading && <p className="text-xs text-muted-foreground">Chargement…</p>}
        {matches.map((m) => (
          <Link
            key={m.id}
            to="/prospects/$prospectId"
            params={{ prospectId: m.id }}
            className="block rounded-md border border-border/60 p-2.5 hover:bg-accent/40 transition"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">
                  {m.lastName} {m.firstName} <span className="text-muted-foreground">· {m.id}</span>
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {m.phone || "—"}{m.phone2 ? ` · ${m.phone2}` : ""}{m.assignedTo ? ` · @${m.assignedTo}` : ""}
                </div>
              </div>
              {m.status && <Badge variant="outline" className="shrink-0">{m.status}</Badge>}
            </div>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}