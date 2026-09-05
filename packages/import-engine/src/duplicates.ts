import type { ValidatedRow } from './types';

/**
 * Flags every row after the first that shares a `Control_ID` with an
 * earlier row, per master prompt §14's "Duplicate records" display
 * category. A row with no `Control_ID` (already invalid on its own) is
 * never considered a duplicate of anything. A row that's already
 * `invalid` on its own merits stays `invalid` — a harder failure than
 * "duplicate" — rather than having that status masked; it still gets the
 * duplicate note added to its issues.
 */
export function markDuplicates(rows: ValidatedRow[]): ValidatedRow[] {
  const seenAtRow = new Map<string, number>();

  return rows.map((row) => {
    const controlId = row.data.controlId;
    if (!controlId) return row;

    const firstSeenAt = seenAtRow.get(controlId);
    if (firstSeenAt === undefined) {
      seenAtRow.set(controlId, row.rowNumber);
      return row;
    }

    return {
      ...row,
      status: row.status === 'invalid' ? 'invalid' : 'duplicate',
      issues: [
        ...row.issues,
        { column: 'Control_ID', message: `Duplicate of row ${firstSeenAt} (same Control_ID '${controlId}')`, severity: 'warning' },
      ],
    };
  });
}
