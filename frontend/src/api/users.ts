import { api } from "@/api/client";
import type { UserCreate, UserRead, UserUpdate } from "@/types";

export async function getUsers(): Promise<UserRead[]> {
  const { data } = await api.get<UserRead[]>("/users/");
  return data;
}

export async function createUser(payload: UserCreate): Promise<UserRead> {
  const { data } = await api.post<UserRead>("/users/", payload);
  return data;
}

export async function updateUser(
  id: string,
  payload: UserUpdate,
): Promise<UserRead> {
  const { data } = await api.patch<UserRead>(`/users/${id}`, payload);
  return data;
}

export async function changeOwnPassword(
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  await api.patch("/users/me/password", {
    current_password: currentPassword,
    new_password: newPassword,
  });
}

export async function resetUserPassword(
  id: string,
  newPassword: string,
): Promise<void> {
  await api.patch(`/users/${id}/password`, { new_password: newPassword });
}
