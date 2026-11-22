/** Supabase returns at most this many rows per request, without saying it cut the list. */
export const PAGE = 1000;

type Failure = { message: string };

/** Reads every row, page by page, until a short page comes back. The query must have a stable order. */
export async function allPages<T>(
  read: (from: number, to: number) => PromiseLike<{ data: unknown; error: Failure | null }>,
): Promise<{ rows: T[]; error: Failure | null }> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await read(from, from + PAGE - 1);
    if (error) return { rows, error };
    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < PAGE) return { rows, error: null };
  }
}
