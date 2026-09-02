import { resolvePagination, toPaginatedResponse } from './pagination';

describe('resolvePagination', () => {
  it('defaults to page 1, pageSize 20 when nothing is given', () => {
    expect(resolvePagination({})).toEqual({ page: 1, pageSize: 20, skip: 0, take: 20 });
  });

  it('computes skip from page and pageSize', () => {
    expect(resolvePagination({ page: 3, pageSize: 10 })).toEqual({ page: 3, pageSize: 10, skip: 20, take: 10 });
  });

  it('caps pageSize at 100 regardless of what is requested', () => {
    expect(resolvePagination({ pageSize: 100000 })).toEqual({ page: 1, pageSize: 100, skip: 0, take: 100 });
  });

  it('falls back to defaults for invalid (zero/negative/non-numeric) values', () => {
    expect(resolvePagination({ page: 0, pageSize: -5 })).toEqual({ page: 1, pageSize: 20, skip: 0, take: 20 });
    expect(resolvePagination({ page: NaN, pageSize: NaN })).toEqual({ page: 1, pageSize: 20, skip: 0, take: 20 });
  });

  it('floors a fractional page/pageSize', () => {
    expect(resolvePagination({ page: 2.9, pageSize: 10.9 })).toEqual({ page: 2, pageSize: 10, skip: 10, take: 10 });
  });
});

describe('toPaginatedResponse', () => {
  it('shapes data + total into the shared PaginatedResponse contract', () => {
    const result = toPaginatedResponse(['a', 'b'], 45, { page: 2, pageSize: 20 });
    expect(result).toEqual({ data: ['a', 'b'], total: 45, page: 2, pageSize: 20, totalPages: 3 });
  });

  it('reports 0 total pages for an empty result set', () => {
    const result = toPaginatedResponse([], 0, { page: 1, pageSize: 20 });
    expect(result.totalPages).toBe(0);
  });
});
