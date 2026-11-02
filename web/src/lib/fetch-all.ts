/**
 * Supabase (PostgREST) devuelve como máximo 1000 filas por consulta (max-rows).
 * Para listados que pueden crecer (resultados de toda una temporada), se pide
 * por páginas hasta traer todo. `build` debe devolver una consulta NUEVA en
 * cada llamada (con el mismo orden estable), a la que se le aplica .range().
 */
export async function fetchAll<T>(
  build: () => { range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }> },
  pageSize = 1000,
  maxRows = 50_000,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < maxRows; from += pageSize) {
    const { data, error } = await build().range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < pageSize) break;
  }
  return out;
}
