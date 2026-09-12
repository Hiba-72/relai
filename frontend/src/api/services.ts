import { api } from "@/api/client";
import type {
  ServiceCreate,
  ServiceRead,
  ServiceUpdate,
  ServiceUsage,
} from "@/types";

export async function getServices(): Promise<ServiceRead[]> {
  const { data } = await api.get<ServiceRead[]>("/services/");
  return data;
}

export async function createService(
  payload: ServiceCreate,
): Promise<ServiceRead> {
  const { data } = await api.post<ServiceRead>("/services/", payload);
  return data;
}

export async function updateService(
  id: string,
  payload: ServiceUpdate,
): Promise<ServiceRead> {
  const { data } = await api.patch<ServiceRead>(`/services/${id}`, payload);
  return data;
}

export async function getServiceUsage(id: string): Promise<ServiceUsage> {
  const { data } = await api.get<ServiceUsage>(`/services/${id}/usage`);
  return data;
}

export async function deleteService(id: string): Promise<void> {
  await api.delete(`/services/${id}`);
}
