import { AlertTriangle, RefreshCw, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { useErp } from "@/lib/erpStore";
import { useAuth } from "@/lib/auth";

export function ErpErrorState({ message }: { message: string }) {
  const { refresh } = useErp();
  const { logout } = useAuth();
  const [retrying, setRetrying] = useState(false);

  const onRetry = async () => {
    setRetrying(true);
    try { await refresh(); } finally { setRetrying(false); }
  };

  return (
    <div className="flex items-center justify-center py-16 px-4 animate-in fade-in duration-200">
      <div className="max-w-md w-full text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 ring-1 ring-destructive/20">
          <AlertTriangle className="h-7 w-7 text-destructive" />
        </div>
        <h2 className="text-xl font-semibold tracking-tight">
          Chargement des données impossible
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>

        <div className="mt-6 flex items-center justify-center gap-2">
          <Button onClick={onRetry} disabled={retrying} size="sm">
            <RefreshCw className={`h-4 w-4 mr-2 ${retrying ? "animate-spin" : ""}`} />
            {retrying ? "Nouvelle tentative…" : "Réessayer"}
          </Button>
          <Button onClick={logout} variant="outline" size="sm">
            <LogOut className="h-4 w-4 mr-2" /> Se reconnecter
          </Button>
        </div>
      </div>
    </div>
  );
}
