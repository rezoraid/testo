const BASE = 'https://app.shinigami.asia'
const API = 'https://api.shngm.io'
const UA = 'Mozilla/5.0 (Android 14; Mobile; rv:153.0) Gecko/153.0 Firefox/153.0'

async function api(path, retries = 2) {
  try {
    const res = await fetch(API + path, {
      headers: { 'user-agent': UA, origin: BASE, referer: `${BASE}/`, accept: 'application/json' },
      signal: AbortSignal.timeout(15000)
    })
    if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status })
    const json = await res.json()
    if (json.retcode !== undefined && json.retcode !== 0) throw new Error(json.message || 'API error')
    return json
  } catch (e) {
    if (retries <= 0 || e.status === 404) throw e
    await new Promise(r => setTimeout(r, 400))
    return api(path, retries - 1)
  }
}

const names = list => (Array.isArray(list) ? list.map(x => x?.name).filter(Boolean) : [])
const status = s => ({ 1: 'ongoing', 2: 'hiatus' })[s] || 'completed'

const toItem = m => ({
  title: m.title,
  id: m.manga_id,
  url: `${BASE}/series/${m.manga_id}/`,
  cover: m.cover_portrait_url || m.cover_image_url || '',
  type: names(m.taxonomy?.Type)[0] || '',
  status: status(m.status),
  genres: names(m.taxonomy?.Genre),
  latestChapter: m.latest_chapter_number ?? null
})

async function list({ q = '', page = 1, size = 24 } = {}) {
  const qs = new URLSearchParams({ page, page_size: size })
  if (q) qs.set('q', q)
  const res = await api(`/v1/manga/list?${qs}`)
  return (res.data ?? []).filter(m => m?.manga_id && m.title).map(toItem)
}

export const search = (q, { page = 1 } = {}) => list({ q, page })
export const latest = ({ page = 1 } = {}) => list({ page })

async function chapterList(id) {
  const size = 100
  const fetchPage = n => api(`/v1/chapter/${id}/list?${new URLSearchParams({ page: n, page_size: size, sort_by: 'chapter_number', sort_order: 'desc' })}`)
  const first = await fetchPage(1)
  const pages = Number(first.meta?.total_page) || 1
  const rest = await Promise.all(Array.from({ length: pages - 1 }, (_, i) => fetchPage(i + 2).catch(() => null)))
  return [first, ...rest]
    .flatMap(r => r?.data ?? [])
    .filter(c => c?.chapter_id)
    .map(c => ({
      id: c.chapter_id,
      number: String(c.chapter_number ?? ''),
      title: c.chapter_title || '',
      date: c.release_date || c.created_at || null
    }))
    .sort((a, b) => parseFloat(b.number) - parseFloat(a.number))
}

export async function detail(id) {
  const [res, chapters] = await Promise.all([api(`/v1/manga/detail/${id}`), chapterList(id)])
  const d = res.data
  if (!d) throw new Error('Manga tidak ditemukan')
  return {
    ...toItem(d),
    synopsis: d.description || '',
    author: names(d.taxonomy?.Author).join(', '),
    artist: names(d.taxonomy?.Artist).join(', '),
    year: d.release_year || null,
    chapters
  }
}

export async function chapter(chapterId) {
  const d = (await api(`/v1/chapter/detail/${chapterId}`)).data
  if (!d) throw new Error('Chapter tidak ditemukan')
  const ch = d.chapter || {}
  const root = ch.base_url || d.base_url || ''
  const join = (...p) => p.map(s => String(s || '').replace(/^\/+|\/+$/g, '')).filter(Boolean).join('/')
  return {
    id: d.chapter_id || chapterId,
    mangaId: d.manga_id,
    number: String(d.chapter_number ?? ''),
    images: (ch.data ?? []).map(f => (/^https?:\/\//.test(f) ? f : join(root, ch.path, f))),
    prev: d.prev_chapter_id || null,
    next: d.next_chapter_id || null
  }
}

export const imageHeaders = { 'user-agent': UA, referer: `${BASE}/`, origin: BASE }
