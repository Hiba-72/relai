import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import { AppLayout } from "@/components/layout/AppLayout";
import { Toaster } from "@/components/ui/sonner";

import { LoginPage } from "@/pages/auth/LoginPage";
import { TicketsPage } from "@/pages/tickets/TicketsPage";
import { NewTicketPage } from "@/pages/tickets/NewTicketPage";
import { TicketDetailPage } from "@/pages/tickets/TicketDetailPage";
import { EquipementsPage } from "@/pages/equipements/EquipementsPage";
import { NewEquipementPage } from "@/pages/equipements/NewEquipementPage";
import { EquipementDetailPage } from "@/pages/equipements/EquipementDetailPage";
import { UsersPage } from "@/pages/admin/UsersPage";
import { ServicesPage } from "@/pages/admin/ServicesPage";
import { ServiceDetailPage } from "@/pages/admin/ServiceDetailPage";
import { PostesPage } from "@/pages/admin/PostesPage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 1000 * 60, retry: 1 },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Toaster />
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          {/* All authenticated users (any role) */}
          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route path="/" element={<Navigate to="/tickets" replace />} />
              <Route path="/tickets" element={<TicketsPage />} />
              <Route path="/tickets/new" element={<NewTicketPage />} />
              <Route path="/tickets/:id" element={<TicketDetailPage />} />
            </Route>
          </Route>

          {/* Informaticien and admin */}
          <Route
            element={<ProtectedRoute minRole="informaticien" redirectTo="/tickets" />}
          >
            <Route element={<AppLayout />}>
              <Route path="/equipements" element={<EquipementsPage />} />
              <Route path="/equipements/new" element={<NewEquipementPage />} />
              <Route path="/equipements/:id" element={<EquipementDetailPage />} />
            </Route>
          </Route>

          {/* Admin only */}
          <Route
            element={<ProtectedRoute minRole="admin" redirectTo="/tickets" />}
          >
            <Route element={<AppLayout />}>
              <Route path="/admin/users" element={<UsersPage />} />
              <Route path="/admin/services" element={<ServicesPage />} />
              <Route path="/admin/services/:id" element={<ServiceDetailPage />} />
              <Route path="/admin/postes" element={<PostesPage />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/tickets" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
