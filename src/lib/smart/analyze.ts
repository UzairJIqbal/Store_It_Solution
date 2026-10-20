// Smart tags, worked out in the browser from the file itself: no server, no API, nothing leaves the device
// except the tags and (for text files) the first part of the text, which are saved with the file so search can use them.

export interface SmartInfo {
    tags: string[],
    // Text-like files only: the start of the text, for "search inside files"
    content: string | null,
}

export const MAX_TAGS = 12
export const MAX_TAG_LENGTH = 32
export const MAX_CONTENT = 10_000
// Bigger files are tagged by type only: reading them would slow the upload down for little gain
const MAX_TEXT_BYTES = 2_000_000
const MAX_IMAGE_BYTES = 25_000_000

const TEXT_EXTENSIONS: Record<string, string | null> = {
    txt: 'notes', md: 'notes', markdown: 'notes', rtf: null, log: 'log',
    csv: 'spreadsheet', tsv: 'spreadsheet', json: 'data', xml: 'data', yaml: 'config', yml: 'config', toml: 'config', ini: 'config', env: 'config',
    html: 'web', htm: 'web', css: 'web', scss: 'web',
    js: 'javascript', jsx: 'javascript', mjs: 'javascript', ts: 'typescript', tsx: 'typescript',
    py: 'python', rb: 'ruby', go: 'go', rs: 'rust', java: 'java', kt: 'kotlin', swift: 'swift', c: 'c', h: 'c', cpp: 'cpp',
    cs: 'csharp', php: 'php', sh: 'shell', sql: 'sql', vue: 'vue', svelte: 'svelte',
}
const CODE = new Set(['javascript', 'typescript', 'python', 'ruby', 'go', 'rust', 'java', 'kotlin', 'swift', 'c', 'cpp', 'csharp', 'php', 'shell', 'sql', 'vue', 'svelte', 'web'])

// Topic tags: a tag is added when enough of its words turn up in the text
const TOPICS: { tag: string, words: string[], need: number }[] = [
    { tag: 'invoice', words: ['invoice', 'amount due', 'bill to', 'subtotal', 'tax', 'payment terms', 'due date'], need: 2 },
    { tag: 'receipt', words: ['receipt', 'paid', 'total', 'change', 'cashier', 'thank you for'], need: 3 },
    { tag: 'meeting', words: ['agenda', 'minutes', 'attendees', 'action items', 'meeting', 'next steps'], need: 2 },
    { tag: 'resume', words: ['experience', 'education', 'skills', 'curriculum vitae', 'resume', 'references'], need: 3 },
    { tag: 'recipe', words: ['ingredients', 'tablespoon', 'teaspoon', 'preheat', 'oven', 'servings', 'cup'], need: 2 },
    { tag: 'contract', words: ['agreement', 'party', 'parties', 'hereby', 'terms', 'liability', 'termination'], need: 3 },
    { tag: 'todo', words: ['todo', '- [ ]', 'to do', 'checklist'], need: 1 },
    { tag: 'report', words: ['summary', 'findings', 'conclusion', 'introduction', 'results', 'methodology'], need: 2 },
]

const STOPWORDS = new Set((
    'about above after again against all also and any are aren because been before being below between both but cannot could ' +
    'did does doing down during each few for from further had has have having her here hers herself him himself his how into ' +
    'its itself just more most myself nor not now off once only other ought our ours ourselves out over own same she should ' +
    'some such than that the their theirs them themselves then there these they this those through too under until very was ' +
    'were what when where which while who whom why will with would you your yours yourself yourselves can may might must ' +
    'shall like get got use used using one two three new make made many much well also via per etc true false null none ' +
    'return const function import export from default class this that else const let var async await string number type ' +
    'http https www com org net html div span px'
).split(' '))

export const cleanTag = (raw: string) =>
    raw.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}-]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, MAX_TAG_LENGTH)

const finish = (tags: (string | null | undefined | false)[], content: string | null = null): SmartInfo => {
    const seen = new Set<string>()
    for (const t of tags) {
        const clean = t ? cleanTag(t) : ''
        if (clean && !seen.has(clean)) seen.add(clean)
        if (seen.size >= MAX_TAGS) break
    }
    return { tags: [...seen], content }
}

const extensionOf = (name: string) => (name.includes('.') ? name.split('.').pop()!.toLowerCase() : '')

const keywords = (text: string, max: number) => {
    const counts = new Map<string, number>()
    for (const word of text.toLowerCase().match(/\p{L}[\p{L}'-]{3,23}/gu) ?? []) {
        const w = word.replace(/'s$/, '')
        if (STOPWORDS.has(w)) continue
        counts.set(w, (counts.get(w) ?? 0) + 1)
    }
    return [...counts.entries()]
        .filter(([, n]) => n >= 2)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, max)
        .map(([w]) => w)
}

const analyzeText = async (file: File, kind: string | null): Promise<SmartInfo> => {
    const raw = await file.slice(0, MAX_TEXT_BYTES).text()
    // A NUL byte in the first part means it's binary after all
    if (raw.slice(0, 4000).includes('\u0000')) return finish(['document'])
    const text = raw.replace(/\r\n?/g, '\n')
    const lower = text.toLowerCase()

    // A topic named in the file name ("venue invoice.txt") counts on its own; in the text it needs supporting words
    const fileName = file.name.toLowerCase()
    const topics = TOPICS.filter((t) => new RegExp(`\\b${t.tag}\\b`).test(fileName)
        || t.words.filter((w) => lower.includes(w)).length >= t.need).map((t) => t.tag)
    const extras = [
        /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/.test(text) && 'emails',
        (text.match(/https?:\/\/\S+/g)?.length ?? 0) >= 3 && 'links',
        /(?:[$€£¥₹]\s?\d|\d\s?(?:usd|eur|gbp|pkr)\b)/i.test(text) && 'money',
    ]
    let shape: string | null = null
    if (kind === 'spreadsheet') {
        const rows = text.split('\n').filter(Boolean)
        shape = rows.length > 1000 ? 'large-table' : 'table'
    }
    const isCode = kind !== null && CODE.has(kind)
    return finish(
        [kind, isCode && 'code', shape, ...topics, ...extras, ...(isCode ? [] : keywords(text, 5))],
        text.slice(0, MAX_CONTENT),
    )
}

// Named colour for a hue/saturation/lightness, coarse on purpose so "blue" finds sky and navy alike
const colourName = (h: number, s: number, l: number) => {
    if (l < 0.12) return 'black'
    if (l > 0.92 && s < 0.25) return 'white'
    if (s < 0.14) return 'grey'
    if (h < 15 || h >= 345) return 'red'
    if (h < 40) return l < 0.45 ? 'brown' : 'orange'
    if (h < 68) return 'yellow'
    if (h < 165) return 'green'
    if (h < 200) return 'teal'
    if (h < 255) return 'blue'
    if (h < 290) return 'purple'
    return 'pink'
}

const toHsl = (r: number, g: number, b: number) => {
    const rn = r / 255, gn = g / 255, bn = b / 255
    const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn)
    const l = (max + min) / 2
    const d = max - min
    if (d === 0) return { h: 0, s: 0, l }
    const s = d / (1 - Math.abs(2 * l - 1))
    let h = max === rn ? ((gn - bn) / d) % 6 : max === gn ? (bn - rn) / d + 2 : (rn - gn) / d + 4
    h *= 60
    if (h < 0) h += 360
    return { h, s, l }
}

// Common screen sizes (and their retina doubles), in either orientation
const SCREENS = [[1280, 720], [1280, 800], [1366, 768], [1440, 900], [1536, 864], [1600, 900], [1680, 1050], [1920, 1080], [1920, 1200],
    [2560, 1440], [2560, 1600], [2880, 1800], [3024, 1964], [3456, 2234], [3840, 2160], [1170, 2532], [1179, 2556], [1284, 2778], [1290, 2796], [1080, 2400], [1080, 1920], [750, 1334]]

const looksLikeScreenshot = (name: string, w: number, h: number) =>
    /screen ?shot|screenshot|capture|scrot/i.test(name)
    || SCREENS.some(([a, b]) => (w === a && h === b) || (w === b && h === a) || (w === a * 2 && h === b * 2))

const analyzeImage = async (file: File, extension: string): Promise<SmartInfo> => {
    const bitmap = await createImageBitmap(file)
    const { width, height } = bitmap
    const ratio = width / height
    const size = 48
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) {
        bitmap.close()
        return finish(['image'])
    }
    ctx.drawImage(bitmap, 0, 0, size, size)
    bitmap.close()
    const { data } = ctx.getImageData(0, 0, size, size)

    // Vote for a colour name per pixel, weighted by saturation so a small bright subject beats a grey sky
    const votes = new Map<string, number>()
    let transparent = 0, lightness = 0, opaque = 0
    for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] < 200) {
            transparent++
            continue
        }
        opaque++
        const { h, s, l } = toHsl(data[i], data[i + 1], data[i + 2])
        lightness += l
        const name = colourName(h, s, l)
        votes.set(name, (votes.get(name) ?? 0) + 0.4 + s)
    }
    const colours = [...votes.entries()].sort((a, b) => b[1] - a[1])
    const total = colours.reduce((sum, [, v]) => sum + v, 0) || 1
    const main = colours.filter(([, v], i) => i === 0 || v / total > 0.22).slice(0, 2).map(([c]) => c)
    const avg = opaque ? lightness / opaque : 0.5

    return finish([
        'image',
        extension === 'gif' ? 'animation' : null,
        Math.abs(ratio - 1) < 0.05 ? 'square' : ratio > 1 ? 'landscape' : 'portrait',
        ratio > 2.2 && 'panorama',
        looksLikeScreenshot(file.name, width, height) ? 'screenshot' : (['jpg', 'jpeg', 'heic', 'heif'].includes(extension) && 'photo'),
        transparent / (size * size) > 0.05 && 'transparent',
        avg < 0.25 ? 'dark' : avg > 0.8 ? 'bright' : null,
        width * height >= 12_000_000 ? 'high-res' : width * height <= 120_000 ? 'small' : null,
        ...main,
    ])
}

const MEDIA_TAGS: Record<string, string[]> = {
    mp4: ['video'], mov: ['video'], webm: ['video'], mkv: ['video'], avi: ['video'],
    mp3: ['audio', 'music'], wav: ['audio'], flac: ['audio', 'music'], m4a: ['audio'], ogg: ['audio'], aac: ['audio'],
    pdf: ['document', 'pdf'], doc: ['document', 'word'], docx: ['document', 'word'], ppt: ['slides'], pptx: ['slides'],
    xls: ['spreadsheet'], xlsx: ['spreadsheet'], key: ['slides'], pages: ['document'], numbers: ['spreadsheet'],
    zip: ['archive'], rar: ['archive'], '7z': ['archive'], tar: ['archive'], gz: ['archive'],
    psd: ['design'], ai: ['design'], fig: ['design'], sketch: ['design'], svg: ['image', 'vector'],
}

const withTimeout = <T,>(promise: Promise<T>, ms: number) => Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
])

// Whether tagging needs the file's bytes; other kinds are tagged from the extension alone
export const needsBytes = (name: string) => {
    const extension = extensionOf(name)
    return extension in TEXT_EXTENSIONS || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'avif'].includes(extension)
}

// Never throws: when anything goes wrong the file is tagged by its type alone
export const analyzeFile = async (file: File): Promise<SmartInfo> => {
    const extension = extensionOf(file.name)
    const fallback = finish(MEDIA_TAGS[extension] ?? [file.type.split('/')[0] || 'file'])
    try {
        if (extension in TEXT_EXTENSIONS && file.size <= MAX_TEXT_BYTES * 5) {
            return await withTimeout(analyzeText(file, TEXT_EXTENSIONS[extension]), 4000)
        }
        if (file.type.startsWith('image/') && extension !== 'svg' && file.size <= MAX_IMAGE_BYTES && typeof createImageBitmap === 'function') {
            return await withTimeout(analyzeImage(file, extension), 4000)
        }
    } catch {
        return fallback
    }
    return fallback
}
