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

async function chapterListApi(slug) {
  const data = await get(`/api/chapters/list?comic=${encodeURIComponent(slug)}`, true)
  return (data?.chapters ?? [])
    .map(c => {
      const s = c.slug || `chapter-${String(c.number).replace(/\./g, '-')}`
      return { slug: s, number: c.number != null ? String(c.number) : s.replace(/^chapter-/, '').replace(/-/g, '.'), title: c.title || '' }
    })
    .sort(byNumber)
}

export async function detail(slug) {
  const $ = await load(await get(`/comic/${encodeURIComponent(slug)}`))

  let ld = {}
  $('script[type="application/ld+json"]').each((_, s) => {
    try {
      for (const x of [].concat(JSON.parse($(s).text()))) if (x?.['@type'] === 'ComicSeries') ld = x
    } catch {}
  })

  const genres = [...new Set($('a[href*="genre="]').map((_, a) => clean($(a).text())).get().filter(Boolean))]
  const text = clean($('#main-content').text() || $('body').text())
  const field = re => text.match(re)?.[1] || ''

  const chapters = []
  $('#tab-chapters a[href*="/read/"]').each((_, a) => {
    const m = String($(a).attr('href')).match(/\/read\/([^/?#]+)\/([^/?#]+)/)
    if (!m || m[1] !== slug || chapters.some(c => c.slug === m[2])) return
    chapters.push({
      slug: m[2],
      number: clean($(a).text()).match(/Chapter\s+(\d+(?:\.\d+)?)/i)?.[1] || m[2].replace(/^chapter-/, '').replace(/-/g, '.'),
      title: clean($(a).find('span').first().text())
    })
  })
  chapters.sort(byNumber)

  const raw = $('[data-sr]').first().attr('data-sr')
  return {
    title: clean($('h1').first().text()) || ld.name || slug,
    slug,
    url: `${site}/comic/${slug}`,
    cover: abs(ld.image || $('meta[property="og:image"]').attr('content')),
    synopsis: (raw && Buffer.from(raw, 'base64').toString('utf8').trim()) || clean(ld.description),
    status: field(/Status\s+(ongoing|completed|hiatus)/i),
    type: field(/Type\s+(manhwa|manga|manhua)/i),
    author: clean(ld.author?.name),
    genres: genres.length ? genres : (ld.genre ?? []),
    rating: num($('#stats-rating-value').text()),
    chapters: chapters.length ? chapters : await chapterListApi(slug).catch(() => [])
  }
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
