import { NavLink, Outlet } from "react-router-dom";
import {
  ArrowLeftRight,
  Cpu,
  KeyRound,
  LogOut,
  Settings2,
  Ticket,
} from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { ROLE_LABEL } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChangePasswordDialog } from "@/components/ChangePasswordDialog";
import { cn } from "@/lib/utils";

export function AppLayout() {
  const { user, logout } = useAuthStore();

  if (!user) return null;

  const isDemandeur = user.role === "demandeur";
  const isAdmin = user.role === "admin";

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
      isActive
        ? "bg-primary/10 text-primary font-semibold"
        : "text-muted-foreground hover:bg-muted hover:text-foreground",
    );

  return (
    <div className="h-screen flex bg-background overflow-hidden">
      <aside className="w-60 border-r border-border bg-card flex flex-col h-screen">
        <div className="px-5 py-5 border-b border-border shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="grid place-items-center h-9 w-9 rounded-[0.625rem] bg-primary text-primary-foreground shrink-0">
              <ArrowLeftRight className="h-[1.188rem] w-[1.188rem]" />
            </div>
            <div className="min-w-0">
              <h1 className="font-serif text-[1.188rem] font-bold leading-tight tracking-tight">
                Relai
              </h1>
              <p className="text-[0.688rem] text-muted-foreground mt-0.5">
                CHU Valmont
              </p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto min-h-0">
          <NavLink to="/tickets" className={linkClass}>
            <Ticket className="h-[1.063rem] w-[1.063rem]" />
            Tickets
          </NavLink>
          {!isDemandeur && (
            <NavLink to="/equipements" className={linkClass}>
              <Cpu className="h-[1.063rem] w-[1.063rem]" />
              Équipements
            </NavLink>
          )}
          {isAdmin && (
            <NavLink to="/admin/users" className={linkClass}>
              <Settings2 className="h-[1.063rem] w-[1.063rem]" />
              Administration
            </NavLink>
          )}
        </nav>

        <div className="border-t border-border p-3 space-y-2 shrink-0">
          <div className="px-2">
            <div className="text-sm font-medium truncate">{user.full_name}</div>
            <div className="mt-1 flex items-center gap-2">
              <Badge variant="muted" className="text-[0.656rem] uppercase tracking-wide">
                {ROLE_LABEL[user.role]}
              </Badge>
            </div>
          </div>
          <ChangePasswordDialog
            trigger={
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start text-muted-foreground"
              >
                <KeyRound className="h-4 w-4" />
                Mot de passe
              </Button>
            }
          />
          <Button
            variant="outline"
            size="sm"
            onClick={logout}
            className="w-full justify-start"
          >
            <LogOut className="h-4 w-4" />
            Déconnexion
          </Button>
        </div>
      </aside>

      {/* min-w-0 is critical: flex items default to min-width: auto, which means
          they cannot shrink below their content's intrinsic width. A child table
          with min-w-[1100px] would expand main past its flex share and cause
          the whole page to scroll horizontally instead of the inner container. */}
      <main className="flex-1 overflow-auto min-w-0">
        <div className="max-w-7xl mx-auto px-8 py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
