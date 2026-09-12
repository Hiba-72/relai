import { api } from "@/api/client";
import type {
  EquipementRead,
  TicketActionRead,
  TicketCreate,
  TicketDemandeurCreate,
  TicketDetail,
  TicketFilters,
  TicketPage,
  TicketRead,
  TicketStatut,
  TicketUpdate,
} from "@/types";

export async function getTickets(filters?: TicketFilters): Promise<TicketPage> {
  const res = await api.get<TicketRead[]>("/tickets/", { params: filters });
  // The endpoint returns the page in the body and the unpaginated total in a
  // header, so a caller can say "showing 100 of 3204" without a second query.
  const total = Number(res.headers["x-total-count"]);
  return {
    items: res.data,
    total: Number.isFinite(total) ? total : res.data.length,
  };
}

export async function getTicket(id: string): Promise<TicketDetail> {
  const { data } = await api.get<TicketDetail>(`/tickets/${id}`);
  return data;
}

export async function createTicket(payload: TicketCreate): Promise<TicketRead> {
  const { data } = await api.post<TicketRead>("/tickets/", payload);
  return data;
}

export async function updateTicket(
  id: string,
  payload: TicketUpdate,
): Promise<TicketRead> {
  const { data } = await api.patch<TicketRead>(`/tickets/${id}`, payload);
  return data;
}

export async function createTicketAsDemandeur(
  payload: TicketDemandeurCreate,
): Promise<TicketRead> {
  const { data } = await api.post<TicketRead>("/tickets/demandeur", payload);
  return data;
}

export async function getDemandeurEquipements(): Promise<EquipementRead[]> {
  const { data } = await api.get<EquipementRead[]>(
    "/tickets/demandeur/equipements",
  );
  return data;
}

export async function assignTicket(
  id: string,
  assigned_to: string,
): Promise<TicketRead> {
  const { data } = await api.patch<TicketRead>(`/tickets/${id}/assign`, {
    assigned_to,
  });
  return data;
}

export async function updateStatus(
  id: string,
  statut: TicketStatut,
): Promise<TicketRead> {
  const { data } = await api.patch<TicketRead>(`/tickets/${id}/status`, { statut });
  return data;
}

export async function addAction(
  id: string,
  description: string,
): Promise<TicketActionRead> {
  const { data } = await api.post<TicketActionRead>(`/tickets/${id}/actions`, {
    description,
  });
  return data;
}

export async function archiveTicket(id: string): Promise<TicketRead> {
  const { data } = await api.patch<TicketRead>(`/tickets/${id}/archive`);
  return data;
}

export async function unarchiveTicket(id: string): Promise<TicketRead> {
  const { data } = await api.patch<TicketRead>(`/tickets/${id}/unarchive`);
  return data;
}
