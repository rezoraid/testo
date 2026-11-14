const BASES = ['https://03.lumosgg.com', 'https://02.lumosgg.com', 'https://lumoskomik.com']
const UA = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'

let site = BASES[0]

const load = async html => (await import('cheerio')).load(html)

async function get(path, json = false) {
  let error
  for (const base of BASES) {
    try {
      const res = await fetch(base + path, {
        headers: { 'user-agent': UA, referer: `${base}/` },
        signal: AbortSignal.timeout(10000)
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

const clean = s => String(s ?? '').replace(/\s+/g, ' ').trim()
const num = s => parseFloat(String(s ?? '').match(/\d+(?:\.\d+)?/)?.[0]) || null
const slugOf = href => String(href || '').match(/\/comic\/([^/?#]+)/)?.[1] || ''
const imgOf = $el => $el.attr('data-src') || $el.attr('data-lazy-src') || $el.attr('src') || ''
const abs = src => (!src ? '' : /^https?:\/\//.test(src) ? src : site + (src.startsWith('/') ? src : '/' + src))
const byNumber = (a, b) => (parseFloat(b.number) || 0) - (parseFloat(a.number) || 0)

const genreNames = list =>
  (Array.isArray(list) ? list : []).map(g => (typeof g === 'string' ? g : g?.name)).filter(Boolean)

const toItem = i => ({
  title: i.title || i.name || i.slug,
  slug: i.slug || i.id,
  url: `${site}/comic/${i.slug || i.id}`,
  cover: abs(i.coverImage || i.cover || i.image),
  type: i.type || '',
  status: i.status || '',
  genres: genreNames(i.genres),
  rating: i.rating ?? i.avgRating ?? null,
  latestChapter: i.latestChapter ?? null
})

const pickList = d =>
  [d, d?.results, d?.data?.items, d?.data, d?.comics, d?.items].find(Array.isArray) ?? []

export async function search(query, { limit = 10 } = {}) {
  const data = await get(`/api/search?q=${encodeURIComponent(query)}&limit=${limit}`, true)
  return pickList(data).map(toItem).filter(x => x.slug)
}

export async function latest({ page = 1 } = {}) {
  const data = await get(`/api/home-latest?page=${page}`, true)
  return (data?.data?.items ?? []).map(i => ({
    ...toItem(i),
    chapters: (i.recentChapters ?? []).map(c => ({ slug: c.slug, number: String(c.number), timeAgo: c.timeAgo || '' }))
  }))
}

export async function popular({ page = 1 } = {}) {
  const data = await get(`/api/popular?page=${page}`, true)
  return pickList(data).map(toItem).filter(x => x.slug)
}

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
const personNames = value => [].concat(value ?? []).map(p => clean(p?.name ?? p)).filter(Boolean).join(', ')

async function chapterListApi(slug) {
  const data = await get(`/api/chapters/list?comic=${encodeURIComponent(slug)}`, true)
  return (data?.chapters ?? [])
    .map(c => {
      const s = c.slug || `chapter-${String(c.number).replace(/\./g, '-')}`
      return {
        slug: s,
        number: c.number != null ? String(c.number) : s.replace(/^chapter-/, '').replace(/-/g, '.'),
        title: c.title || '',
        date: c.publishedAt || c.createdAt || c.updatedAt || null
      }
    })
    .sort(byNumber)
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

export function parseSeries(ld = {}) {
  return {
    title: clean(ld.name),
    altTitles: [].concat(ld.alternateName ?? []).map(clean).filter(Boolean),
    cover: ld.image || '',
    synopsis: clean(ld.description),
    author: personNames(ld.author),
    artist: personNames(ld.illustrator),
    genres: [...new Set([].concat(ld.genre ?? []).map(clean).filter(Boolean))],
    year: parseInt(ld.datePublished, 10) || null,
    rating: Number(ld.aggregateRating?.ratingValue) || null,
    totalChapters: Number(ld.numberOfEpisodes) || 0
  }
}

function readSeriesLd($) {
  let series = {}
  $('script[type="application/ld+json"]').each((_, s) => {
    try {
      const nodes = [].concat(JSON.parse($(s).text())).flatMap(x => x?.['@graph'] ?? x)
      series = nodes.find(x => x?.['@type'] === 'ComicSeries') ?? series
    } catch {}
  })
  return series
}

function readChapters($, slug) {
  const chapters = []
  $('#tab-chapters a[href*="/read/"], a[href*="/read/"]').each((_, a) => {
    const m = String($(a).attr('href')).match(/\/read\/([^/?#]+)\/([^/?#]+)/)
    if (!m || m[1] !== slug || chapters.some(c => c.slug === m[2])) return
    chapters.push({
      slug: m[2],
      number: clean($(a).text()).match(/Chapter\s+(\d+(?:\.\d+)?)/i)?.[1] || m[2].replace(/^chapter-/, '').replace(/-/g, '.'),
      title: clean($(a).find('span').first().text()),
      date: $(a).find('time').attr('datetime') || null
    })
  })
  return chapters
}

function readGenreLinks($) {
  const scope = $('#main-content').length ? $('#main-content') : $('body')
  return [...new Set(scope.find('a[href*="genre="]').map((_, a) => clean($(a).text())).get().filter(Boolean))]
}

export async function detail(slug) {
  const $ = await load(await get(`/comic/${encodeURIComponent(slug)}`))
  const meta = parseSeries(readSeriesLd($))

  const text = clean($('#main-content').text() || $('body').text())
  const field = re => text.match(re)?.[1] || ''

  const htmlChapters = readChapters($, slug)
  const incomplete = !htmlChapters.length || htmlChapters.length < meta.totalChapters
  const apiChapters = incomplete ? await chapterListApi(slug).catch(() => []) : []

  const encoded = $('[data-sr]').first().attr('data-sr')
  const synopsis = (encoded && Buffer.from(encoded, 'base64').toString('utf8').trim()) || meta.synopsis

  return {
    title: meta.title || clean($('h1').first().text()) || slug,
    altTitles: meta.altTitles,
    slug,
    url: `${site}/comic/${slug}`,
    cover: abs(meta.cover || $('meta[property="og:image"]').attr('content')),
    synopsis: synopsis || clean($('meta[property="og:description"]').attr('content')),
    status: normalizeStatus(field(/Status\s*:?\s*(on ?going|berjalan|completed|tamat|selesai|hiatus)/i)),
    type: field(/(?:Type|Tipe)\s*:?\s*(manhwa|manga|manhua|webtoon|doujinshi)/i).toLowerCase(),
    author: meta.author,
    artist: meta.artist,
    year: meta.year,
    genres: meta.genres.length ? meta.genres : readGenreLinks($),
    rating: meta.rating ?? num($('#stats-rating-value').text()),
    totalChapters: meta.totalChapters,
    chapters: mergeChapters(htmlChapters, apiChapters)
  }
}

export async function genres() {
  const $ = await load(await get('/browse'))
  const found = new Map()
  $('a[href*="genre="]').each((_, a) => {
    const value = decodeURIComponent(String($(a).attr('href')).match(/genre=([^&#]+)/)?.[1] ?? '').replace(/\+/g, ' ')
    const name = clean($(a).text()).replace(/\s*\(?\d+\)?$/, '') || value
    if (value && name && !found.has(value.toLowerCase())) found.set(value.toLowerCase(), { name, slug: value })
  })
  return [...found.values()]
}

export async function chapter(slug, chapterSlug) {
  const html = await get(`/read/${encodeURIComponent(slug)}/${encodeURIComponent(chapterSlug)}`)
  const $ = await load(html)

  const images = [
    ...new Set(
      $('img')
        .map((_, el) => imgOf($(el)))
        .get()
        .filter(src => src && !/^\/api\/image\/(thumbnail|p\/|reactions)/.test(src))
        .map(abs)
        .filter(u => /\/(?:file\/)?comic\//.test(u))
    )
  ]

  const flat = html.replace(/&quot;|&#34;/g, '"')
  const nav = key => flat.match(new RegExp(`"${key}":\\[0,"([^"\\\\]+)"\\]`))?.[1] || null

  return {
    slug: chapterSlug,
    comic: slug,
    number: chapterSlug.replace(/^chapter-/i, '').replace(/-/g, '.'),
    url: `${site}/read/${slug}/${chapterSlug}`,
    images,
    prev: nav('prevChapterSlug'),
    next: nav('nextChapterSlug')
  }
}

export const imageHeaders = () => ({ 'user-agent': UA, referer: `${site}/` })
