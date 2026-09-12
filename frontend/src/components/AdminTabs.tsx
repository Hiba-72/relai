import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";

const TABS = [
  { to: "/admin/users", label: "Utilisateurs" },
  { to: "/admin/services", label: "Services" },
  { to: "/admin/postes", label: "Postes" },
];

export function AdminTabs() {
  return (
    <div className="flex gap-1 border-b border-border">
      {TABS.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          end
          className={({ isActive }) =>
            cn(
              "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              isActive
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )
          }
        >
          {t.label}
        </NavLink>
      ))}
    </div>
  );
}
