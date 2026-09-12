import { api } from "@/api/client";
import type {
  EquipementCreate,
  EquipementFilters,
  EquipementHistoryEntry,
  EquipementRead,
  EquipementUpdate,
} from "@/types";

export async function getEquipements(
  filters?: EquipementFilters,
): Promise<EquipementRead[]> {
  const { data } = await api.get<EquipementRead[]>("/equipements/", {
    params: filters,
  });
  return data;
}

export async function getEquipement(id: string): Promise<EquipementRead> {
  const { data } = await api.get<EquipementRead>(`/equipements/${id}`);
  return data;
}

export async function createEquipement(
  payload: EquipementCreate,
): Promise<EquipementRead> {
  const { data } = await api.post<EquipementRead>("/equipements/", payload);
  return data;
}

export async function updateEquipement(
  id: string,
  payload: EquipementUpdate,
): Promise<EquipementRead> {
  const { data } = await api.patch<EquipementRead>(`/equipements/${id}`, payload);
  return data;
}

export async function archiveEquipement(id: string): Promise<EquipementRead> {
  const { data } = await api.delete<EquipementRead>(`/equipements/${id}`);
  return data;
}

/**
 * Irreversibly remove an equipement from the DB (admin-only). Linked ticket
 * associations cascade — the tickets themselves stay but lose the pointer.
 */
export async function deleteEquipementPermanently(id: string): Promise<void> {
  await api.delete(`/equipements/${id}/permanent`);
}

export async function getEquipementHistory(
  id: string,
): Promise<EquipementHistoryEntry[]> {
  const { data } = await api.get<EquipementHistoryEntry[]>(
    `/equipements/${id}/history`,
  );
  return data;
}

/**
 * Download the full inventory as an Excel file. Triggers a browser download
 * via a temporary anchor; resolves once the file is on disk.
 */
export async function exportEquipementsXlsx(): Promise<void> {
  const response = await api.get<Blob>("/equipements/export.xlsx", {
    responseType: "blob",
  });

  // Prefer the filename the backend suggests; fall back to a sane default.
  const dispo = (response.headers["content-disposition"] ?? "") as string;
  const match = dispo.match(/filename="([^"]+)"/);
  const filename =
    match?.[1] ?? `inventaire_${new Date().toISOString().slice(0, 10)}.xlsx`;

  const blob = new Blob([response.data], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}
