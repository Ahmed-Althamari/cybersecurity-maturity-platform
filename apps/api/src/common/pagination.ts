import type { PaginatedResponse } from '@cmmp/shared';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

export interface PaginationInput {
  page?: number;
  pageSize?: number;
}

export interface ResolvedPagination {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
}

/**
 * Normalizes untrusted `page`/`pageSize` query params into Prisma
 * `skip`/`take` -- invalid or missing values fall back to page 1 / the
 * default size, and `pageSize` is always capped at MAX_PAGE_SIZE
 * regardless of what a caller asks for, so a `?pageSize=100000` can't turn
 * a "paginated" endpoint back into an unbounded one.
 */
export function resolvePagination(input: PaginationInput): ResolvedPagination {
  const page = input.page && input.page > 0 ? Math.floor(input.page) : 1;
  const pageSize =
    input.pageSize && input.pageSize > 0 ? Math.min(Math.floor(input.pageSize), MAX_PAGE_SIZE) : DEFAULT_PAGE_SIZE;
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

/** Shapes a page of results + its total count into the shared PaginatedResponse contract. */
export function toPaginatedResponse<T>(
  data: T[],
  total: number,
  pagination: Pick<ResolvedPagination, 'page' | 'pageSize'>,
): PaginatedResponse<T> {
  return {
    data,
    total,
    page: pagination.page,
    pageSize: pagination.pageSize,
    totalPages: Math.ceil(total / pagination.pageSize),
  };
}
