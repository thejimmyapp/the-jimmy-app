import { api } from "./api";

export const guestMatchupsQueryKey = ["guest-matchups"] as const;

export const guestMatchupsQuery = {
  queryKey: guestMatchupsQueryKey,
  queryFn: () => api.guestMatchups(),
};
