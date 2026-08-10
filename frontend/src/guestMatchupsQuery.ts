import { api } from "./api";

export const guestMatchupsQuery = {
  queryKey: ["guest-matchups"] as const,
  queryFn: api.guestMatchups,
};
