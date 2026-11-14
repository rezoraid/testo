const BASES = ['https://03.lumosgg.com', 'https://02.lumosgg.com', 'https://lumoskomik.com']
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'

let site = BASES[0]

async function get(path, json = false) {
  let error
  for (const base of BASES) {
    try {
      const res = await fetch(base + path, {
        headers: {
          'user-agent': UA,
          accept: json ? 'application/json, text/plain, */*' : 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'accept-language': 'id,en-US;q=0.9,en;q=0.8',
          referer: `${base}/`
        },
        signal: AbortSignal.timeout(15000)
      })
      if (res.status === 404) throw Object.assign(new Error('Tidak ditemukan'), { status: 404 })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      site = base
      return json ? await res.json() : await res.text()
    } catch (e) {
      error = e
      if (e.status === 404) break
    }
  }
  throw error
}

const decode = s =>
  String(s ?? '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&(quot|apos|lt|gt|nbsp);/g, (_, n) => ({ quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' })[n])
    .replace(/&amp;/g, '&')

const clean = s => decode(String(s ?? '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
const num = s => parseFloat(String(s ?? '').match(/\d+(?:\.\d+)?/)?.[0]) || null
const byNumber = (a, b) => (parseFloat(b.number) || 0) - (parseFloat(a.number) || 0)

// Thumbnail Lumos berupa /api/image/thumbnail?src=<base64 url asli>
function img(src) {
  src = decode(src)
  if (!src) return ''
  if (/^https?:\/\//.test(src)) return src
  const b64 = src.match(/[?&]src=([\w\-=]+)/)?.[1]
  if (b64) {
    try {
      const url = Buffer.from(b64.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
      if (url.startsWith('http')) return url
    } catch {}
  }
  return site + (src.startsWith('/') ? src : '/' + src)
}

const genreNames = list =>
  (Array.isArray(list) ? list : []).map(g => clean(typeof g === 'string' ? g : g?.name)).filter(Boolean)

const toItem = i => ({
  title: clean(i.title || i.name) || i.slug,
  slug: i.slug,
  url: `${site}/comic/${i.slug}`,
  cover: img(i.coverImage),
  type: i.type || '',
  status: i.status || '',
  genres: genreNames(i.genres),
  rating: i.rating ?? null,
  latestChapter: i.latestChapter ?? null
})

const STATUSES = {
  ongoing: 'ongoing',
  'on going': 'ongoing',
  berjalan: 'ongoing',
  completed: 'completed',
  tamat: 'completed',
  selesai: 'completed',
  hiatus: 'hiatus'
}

const normalizeStatus = value => STATUSES[clean(value).toLowerCase()] || ''

export async function search(query, { limit = 10 } = {}) {
  const data = await get(`/api/search?q=${encodeURIComponent(query)}`, true)
  return (data?.results ?? []).filter(i => i.slug).slice(0, limit).map(toItem)
}

export async function latest({ page = 1 } = {}) {
  const data = await get(`/api/home-latest?page=${page}`, true)
  return (data?.data?.items ?? []).filter(i => i.slug).map(i => ({
    ...toItem(i),
    chapters: (i.recentChapters ?? []).map(c => ({ slug: c.slug, number: String(c.number), timeAgo: c.timeAgo || '' }))
  }))
}

// Halaman /browse (HTML): dipakai untuk popular halaman 2 dst, karena /api/popular tidak punya pagination
async function browse(sort, page) {
  const params = new URLSearchParams({ sort })
  if (page > 1) params.set('page', page)
  const html = await get(`/browse?${params}`)

  const items = []
  const cardRegex = /<div[^>]*class="[^"]*htg-card[^"]*"[^>]*>([\s\S]*?)(?=<div[^>]*class="[^"]*htg-card[^"]*"|$)/gi
  for (const [, card] of html.matchAll(cardRegex)) {
    const slug = card.match(/href="\/comic\/([a-zA-Z0-9_\-]+)"/i)?.[1]
    if (!slug) continue
    items.push({
      title: clean(card.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i)?.[1]) || slug,
      slug,
      url: `${site}/comic/${slug}`,
      cover: img(card.match(/<img[^>]+src="([^"]+)"/i)?.[1]),
      type: '',
      status: normalizeStatus(card.match(/<span[^>]*class="[^"]*capitalize[^"]*"[^>]*>([\s\S]*?)<\/span>/i)?.[1]),
      genres: [],
      rating: num(card.match(/<svg[\s\S]*?<\/svg>\s*([0-9.]+)\s*<\/span>/i)?.[1]),
      latestChapter: null
    })
  }
  return items
}

export async function popular({ page = 1 } = {}) {
  if (page > 1) return browse('popular', page)
  const data = await get('/api/popular?tab=komik&period=all&perPage=30', true)
  return (data?.data ?? []).filter(i => i.slug).map(i => ({
    ...toItem(i),
    rating: i.rating ? Number((i.rating / 100).toFixed(1)) : null
  }))
}

async function chapterListApi(slug) {
  const data = await get(`/api/chapters/list?comic=${encodeURIComponent(slug)}`, true)
  return (data?.chapters ?? []).map(c => {
    const s = c.slug || `chapter-${String(c.number).replace(/\./g, '-')}`
    return {
      slug: s,
      number: c.number != null ? String(c.number) : s.replace(/^chapter-/, '').replace(/-/g, '.'),
      title: c.title || '',
      date: c.publishedAt || c.createdAt || c.updatedAt || null
    }
  })
}

function mergeChapters(...lists) {
  const merged = new Map()
  for (const chapter of lists.flat()) {
    const existing = merged.get(chapter.slug)
    if (!existing) {
      merged.set(chapter.slug, { ...chapter })
      continue
    }
    existing.title ||= chapter.title
    existing.date ||= chapter.date
  }
  return [...merged.values()].sort(byNumber)
}

function readChapters(html) {
  const chapters = []
  const re = /<a[^>]+href="(\/read\/[^\/]+\/([a-zA-Z0-9_\-]+))"[^>]+data-chapter="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi
  for (const [, , slug, number, inner] of html.matchAll(re)) {
    chapters.push({
      slug,
      number: decode(number).trim() || slug.replace(/^chapter-/, '').replace(/-/g, '.'),
      title: clean(inner.match(/<span[^>]*class="[^"]*text-heading[^"]*"[^>]*>([\s\S]*?)<\/span>/i)?.[1]),
      date:
        inner.match(/<time[^>]*datetime="([^"]+)"/i)?.[1] ||
        clean(inner.match(/<span[^>]*class="[^"]*text-right[^"]*"[^>]*>([\s\S]*?)<\/span>/i)?.[1]) ||
        null
    })
  }
  return chapters
}

// JSON-LD ComicSeries: sumber author/artist (tidak ada di HTML detail)
function readSeriesLd(html) {
  for (const [, json] of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const nodes = [].concat(JSON.parse(json)).flatMap(x => x?.['@graph'] ?? x)
      const series = nodes.find(x => x?.['@type'] === 'ComicSeries')
      if (series) return series
    } catch {}
  }
  return {}
}

const personNames = value => [].concat(value ?? []).map(p => clean(p?.name ?? p)).filter(Boolean).join(', ')

export async function detail(slug) {
  const html = await get(`/comic/${encodeURIComponent(slug)}`)
  const ld = readSeriesLd(html)
  const pick = re => html.match(re)?.[1]

  const altTitles = clean(pick(/<h1[\s\S]*?<\/h1>\s*<p[^>]*class="[^"]*text-surface-400[^"]*"[^>]*>([\s\S]*?)<\/p>/i))
    .split('·')
    .map(s => s.trim())
    .filter(Boolean)

  const encoded = pick(/data-sr="([^"]+)"/i)
  let synopsis = ''
  if (encoded) {
    try {
      synopsis = Buffer.from(encoded, 'base64').toString('utf8').trim()
    } catch {}
  }
  synopsis ||= clean(pick(/<meta[^>]+name="description"[^>]+content="([^"]*)"/i)) || clean(ld.description)

  const genres = [
    ...new Set(
      [...html.matchAll(/<a[^>]+href="\/browse\?genre=[^"]+"[^>]*>([\s\S]*?)<\/a>/gi)].map(m => clean(m[1])).filter(Boolean)
    )
  ]

  const badge = pick(/<svg[\s\S]*?<\/svg>\s*<span>(\d+)<\/span>\s*<\/div>\s*<div[^>]*>Chapter<\/div>/i)
  let chapters = readChapters(html)
  const totalChapters = Number(badge) || Number(ld.numberOfEpisodes) || chapters.length
  const apiChapters = !chapters.length || chapters.length < totalChapters ? await chapterListApi(slug).catch(() => []) : []
  chapters = mergeChapters(chapters, apiChapters)

  return {
    title: clean(pick(/<h1[^>]*>([\s\S]*?)<\/h1>/i)) || clean(ld.name) || slug,
    altTitles: altTitles.length ? altTitles : [].concat(ld.alternateName ?? []).map(clean).filter(Boolean),
    slug,
    url: `${site}/comic/${slug}`,
    cover: img(
      pick(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i) ||
        pick(/<img[^>]+class="[^"]*aspect-\[2\/3\][^"]*"[^>]+src="([^"]+)"/i) ||
        ld.image
    ),
    synopsis,
    status: normalizeStatus(pick(/Status<\/div>[\s\S]*?<span[^>]*class="[^"]*capitalize[^"]*"[^>]*>([\s\S]*?)<\/span>/i)),
    type: clean(pick(/Type<\/div>[\s\S]*?<div[^>]*class="[^"]*text-sm[^"]*"[^>]*>([\s\S]*?)<\/div>/i)).toLowerCase(),
    author: personNames(ld.author),
    artist: personNames(ld.illustrator),
    year:
      parseInt(clean(pick(/Tahun[\s\S]*?<span[^>]*class="text-sm font-medium text-surface-100"[^>]*>([\s\S]*?)<\/span>/i)), 10) ||
      parseInt(ld.datePublished, 10) ||
      null,
    genres: genres.length ? genres : genreNames(ld.genre),
    rating: num(pick(/class="rating-value"[^>]*>([\s\S]*?)<\/span>/i)) ?? (Number(ld.aggregateRating?.ratingValue) || null),
    totalChapters,
    chapters
  }
}

export async function genres() {
  const html = await get('/browse')
  const found = new Map()
  for (const [, value, inner] of html.matchAll(/<[^>]+data-bf-genre-name="([^"]+)"[^>]*>([\s\S]*?)<\/(?:label|div)>/gi)) {
    const slug = decode(value)
    if (!found.has(slug.toLowerCase())) found.set(slug.toLowerCase(), { name: clean(inner) || slug, slug })
  }
  return [...found.values()]
}

export async function chapter(slug, chapterSlug) {
  const path = `/read/${encodeURIComponent(slug)}/${encodeURIComponent(chapterSlug)}`
  const html = await get(path)

  const pages = new Map()
  const imgRegex = /<img[^>]+(?:alt="Page\s*(\d+)"[^>]+src="([^"]+)"|src="([^"]+)"[^>]+alt="Page\s*(\d+)")/gi
  for (const m of html.matchAll(imgRegex)) pages.set(img(m[2] || m[3]), parseInt(m[1] || m[4], 10))
  const images = [...pages].sort((a, b) => a[1] - b[1]).map(([url]) => url)

  let prev = null
  let next = null
  for (const m of html.matchAll(/<a[^>]+href="\/read\/[^\/]+\/([a-zA-Z0-9_\-]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const text = clean(m[2]).toLowerCase()
    if (text.includes('prev') || text.includes('sebelumnya')) prev = m[1]
    else if (text.includes('next') || text.includes('selanjutnya')) next = m[1]
  }

  return {
    slug: chapterSlug,
    comic: slug,
    number: html.match(/const chapterNumber\s*=\s*"([^"]+)"/i)?.[1] || chapterSlug.replace(/^chapter-/i, '').replace(/-/g, '.'),
    url: `${site}${path}`,
    images,
    prev,
    next
  }
}

export const imageHeaders = () => ({ 'user-agent': UA, referer: `${site}/` })
