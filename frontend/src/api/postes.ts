import { api } from "@/api/client";
import type {
  PosteCreate,
  PosteFilters,
  PosteRead,
  PosteUpdate,
} from "@/types";

export async function getPostes(filters?: PosteFilters): Promise<PosteRead[]> {
  const { data } = await api.get<PosteRead[]>("/postes/", { params: filters });
  return data;
}

export async function getPoste(id: string): Promise<PosteRead> {
  const { data } = await api.get<PosteRead>(`/postes/${id}`);
  return data;
}

export async function createPoste(payload: PosteCreate): Promise<PosteRead> {
  const { data } = await api.post<PosteRead>("/postes/", payload);
  return data;
}

export async function updatePoste(
  id: string,
  payload: PosteUpdate,
): Promise<PosteRead> {
  const { data } = await api.patch<PosteRead>(`/postes/${id}`, payload);
  return data;
}

export async function deletePoste(id: string): Promise<void> {
  await api.delete(`/postes/${id}`);
}
