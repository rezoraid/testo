const BASE = 'https://manta.net'
const HOME_VERSION = '202606'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
const PAGE_SIZE = 20
const SECTIONS = { comic: 'comics', manga: 'manga', novel: 'novels' }

async function get(path, json = false, retries = 2) {
  try {
    const res = await fetch(BASE + path, {
      headers: { 'user-agent': UA, referer: `${BASE}/en`, 'accept-language': 'en-US,en;q=0.9' },
      signal: AbortSignal.timeout(15000)
    })
    if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status })
    return json ? await res.json() : await res.text()
  } catch (e) {
    if (retries <= 0 || e.status === 404) throw e
    await new Promise(r => setTimeout(r, 400))
    return get(path, json, retries - 1)
  }
}

async function pageProps(path) {
  const html = await get(path)
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s)
  if (!m) throw new Error(`Data tidak ditemukan: ${path}`)
  return JSON.parse(m[1]).props?.pageProps ?? {}
}

const loc = v => (v && typeof v === 'object' ? (v.en ?? Object.values(v)[0] ?? '') : (v ?? ''))
const tagNames = list => (list ?? []).map(t => (typeof t === 'string' ? t : loc(t.name))).filter(Boolean)

function cover(image = {}) {
  for (const k of ['1280x1840_720', '1280x1840_480', '1440x1440_720', '1440x1440_480', 'thumbnail1']) {
    if (image[k]?.downloadUrl) return image[k].downloadUrl
  }
  return ''
}

function typeOf(n, tags = []) {
  n = Number(n ?? 0)
  if (n === 40) return 'novel'
  if (n === 50 || n === 60) return 'manga'
  return tags.some(t => t?.id === 292) ? 'novel' : 'comic'
}

function toItem(raw) {
  const d = raw.data ?? {}
  const id = String(raw.id ?? raw.seriesId ?? '')
  return {
    title: String(loc(d.title) || raw.title || '').trim(),
    id,
    url: `${BASE}/en/series/${id}`,
    cover: cover(raw.image) || raw.coverImage?.downloadUrl || '',
    type: typeOf(raw.type ?? raw.seriesType, d.tags),
    genres: tagNames(d.tags),
    chapterCount: raw.episodeCount ?? raw.latestEpisode?.ord ?? null
  }
}

export async function search(query, { limit = 10 } = {}) {
  const res = await get(`/manta/v1/search/series?lang=en&q=${encodeURIComponent(query)}`, true)
  return (Array.isArray(res.data) ? res.data : []).map(toItem).filter(x => x.id && x.title).slice(0, limit)
}

export async function latest({ type = 'comic', page = 1 } = {}) {
  const res = await get(`/front/v1/home/${HOME_VERSION}?lang=en&homeType=${SECTIONS[type] || 'comics'}`, true)
  const map = res.data?.seriesMap ?? {}
  const items = (res.data?.items ?? []).map(it => toItem({ ...(map[it.seriesId] ?? {}), ...it })).filter(x => x.id && x.title)
  return items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
}

export async function detail(id) {
  const p = await pageProps(`/en/series/${encodeURIComponent(id)}`)
  const s = p.initialSeries
  if (!s) throw new Error(`Series "${id}" tidak ditemukan`)
  const d = s.data ?? {}
  return {
    title: String(loc(d.title) || p.headData?.title || id).trim(),
    id,
    url: `${BASE}/en/series/${id}`,
    cover: cover(s.image) || p.headData?.image || '',
    synopsis: d.description?.long ?? d.description?.short ?? p.headData?.description ?? '',
    type: typeOf(s.type, d.tags),
    author: (d.creators ?? []).map(c => c.name).filter(Boolean).join(', '),
    genres: tagNames(d.tags),
    chapters: (s.episodes ?? [])
      .map(ep => ({
        id: String(ep.id),
        number: String(ep.ord ?? ep.id),
        title: ep.data?.title ?? `Episode ${ep.ord}`,
        date: ep.openAt ?? null
      }))
      .sort((a, b) => parseFloat(b.number) - parseFloat(a.number))
  }
}

export async function chapter(seriesId, episodeId) {
  let id = String(episodeId)
  const chaptersP = detail(seriesId).then(d => d.chapters, () => [])
  if (Number(id) < 1000) id = (await chaptersP).find(c => c.number === id)?.id ?? id
  const [p, chapters] = await Promise.all([pageProps(`/en/episodes/${encodeURIComponent(id)}`), chaptersP])
  const i = chapters.findIndex(c => c.id === id)
  return {
    id,
    seriesId,
    number: i !== -1 ? chapters[i].number : id,
    images: (p.previewCutImages ?? []).map(x => x.downloadUrl).filter(Boolean),
    prev: i !== -1 && i < chapters.length - 1 ? chapters[i + 1].id : null,
    next: i > 0 ? chapters[i - 1].id : null
  }
}

export const imageHeaders = { 'user-agent': UA, referer: `${BASE}/en` }
