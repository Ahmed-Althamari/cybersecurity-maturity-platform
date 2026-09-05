import Papa from 'papaparse';

import type { RawSheet } from './types';

/** Parses CSV text into a header row + data rows. Empty lines are skipped rather than producing phantom rows. */
export function parseCsv(content: string): RawSheet {
  const result = Papa.parse<string[]>(content, { skipEmptyLines: true });
  const [headers = [], ...rows] = result.data;
  return { headers, rows };
}
