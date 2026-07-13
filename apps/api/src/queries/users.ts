import type { TenantContext } from "../context/TenantContext.js";
import { getUsersPaginated, type GetUsersFilters, type User } from "../db.js";

/**
 * QUERIES — User domain.
 *
 * Read-only. No writes, no audit log.
 */

export interface UserDto {
  id: string;
  name: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  role: string;
  status: string;
  region: string | null;
  created_at: string;
  updated_at: string;
}

function toDto(u: User): UserDto {
  return {
    id: u.id,
    name: u.name ?? "",
    first_name: u.first_name,
    last_name: u.last_name,
    email: u.email,
    role: u.role,
    status: u.status,
    region: u.region,
    created_at: u.created_at instanceof Date ? u.created_at.toISOString() : String(u.created_at),
    updated_at: u.updated_at instanceof Date ? u.updated_at.toISOString() : String(u.updated_at),
  };
}

export interface GetUserListInput {
  search?: string;
  role?: string | string[];
  status?: string | string[];
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export interface GetUserListResult {
  items: UserDto[];
  total: number;
}

export async function GetUserListQuery(
  ctx: TenantContext,
  input: GetUserListInput
): Promise<GetUserListResult> {
  const filters: GetUsersFilters = {
    search: input.search,
    role: input.role,
    status: input.status,
  };

  const page = input.page ?? 1;
  const limit = input.limit ?? 50;
  const sortBy = input.sortBy ?? "created_at";
  const sortOrder = input.sortOrder ?? "desc";

  const { rows, total } = await getUsersPaginated(ctx.client, filters, page, limit, sortBy, sortOrder);
  return { items: rows.map(toDto), total };
}
