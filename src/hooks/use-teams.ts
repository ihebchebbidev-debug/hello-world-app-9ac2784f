import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import type { AppTeam } from "@/lib/types";

export function useTeams() {
  const [teams, setTeams] = useState<AppTeam[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api<{ teams: AppTeam[] }>("/teams.php");
      setTeams(r.teams ?? []);
    } catch {
      setTeams([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  return { teams, loading, refresh };
}
