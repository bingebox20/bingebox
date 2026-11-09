import { cards, type Audience } from './catalog-index.js';
import { db } from './db.js';
import type { CatalogPageQuery } from './animedoc.js';

const own = "(external_key IS NULL OR external_key NOT LIKE 'animedoc:%')";
export const hasStudioTitles = () => !!db.prepare(`SELECT 1 FROM titles WHERE status='published' AND ${own} LIMIT 1`).get();

export function studioTitles(audience: Audience, type?: 'movie' | 'series') {
  const ids = db.prepare(`SELECT id FROM titles WHERE status='published' AND ${own} ORDER BY created_at DESC,id DESC`).pluck().all() as number[];
  return cards(ids, audience).filter((t) => !type || t.type === type);
}

export function studioPage(q: CatalogPageQuery, audience: Audience) {
  const all = studioTitles(audience, q.type).filter((t) => (!q.genre || t.genreSlugs.includes(q.genre)) &&
    (!q.year || t.year === q.year) && (!q.decade || (t.year !== null && t.year >= q.decade && t.year < q.decade + 10)) &&
    (!q.maxRuntime || (t.runtimeMin !== null && t.runtimeMin <= q.maxRuntime)) &&
    (!q.collection || /^(nigeria|ng)$/i.test(String(db.prepare('SELECT country FROM titles WHERE id=?').pluck().get(t.id) ?? ''))) &&
    (!q.language || /^yoruba$/i.test(String(db.prepare('SELECT language FROM titles WHERE id=?').pluck().get(t.id) ?? ''))));
  all.sort((a, b) => {
    if (q.sort === 'az') return a.title.localeCompare(b.title);
    if (q.sort === 'newest') return (b.year ?? 0) - (a.year ?? 0) || b.id - a.id;
    if (q.sort === 'oldest') return (a.year ?? 9999) - (b.year ?? 9999) || a.id - b.id;
    if (q.sort === 'rating') return (b.externalRating?.score ?? b.rating?.score ?? 0) - (a.externalRating?.score ?? a.rating?.score ?? 0) || b.id - a.id;
    if (q.sort === 'runtime') return (a.runtimeMin ?? Infinity) - (b.runtimeMin ?? Infinity) || b.id - a.id;
    if (q.sort === 'popular') return b.popularity - a.popularity || b.id - a.id;
    return b.createdAt - a.createdAt || b.id - a.id;
  });
  const offset = (q.page - 1) * q.pageSize;
  return { items: all.slice(offset, offset + q.pageSize), total: all.length, hasMore: offset + q.pageSize < all.length };
}
