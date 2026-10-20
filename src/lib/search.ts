// Search filters and their URL form. Shared by the search box, the results page, the API route and the server query.
// Drive puts filters inside q as operators (type:video); StoreIt keeps them as separate parameters, easier to share.

import { FileType } from '../../types'

export type SearchType = FileType | 'folder'
export type ModifiedPreset = 'today' | '7d' | '30d' | 'this-year' | 'last-year' | 'custom'
export type SearchLocation = 'anywhere' | 'mine' | 'shared' | 'starred' | 'trash'
export type OwnerFilter = 'anyone' | 'me' | 'others'

export interface SearchFilters {
    q: string
    types: SearchType[]
    modified: ModifiedPreset | null
    // yyyy-mm-dd, only with modified = custom
    from: string | null
    to: string | null
    location: SearchLocation
    owner: OwnerFilter
}

export const EMPTY_FILTERS: SearchFilters = {
    q: '', types: [], modified: null, from: null, to: null, location: 'anywhere', owner: 'anyone',
}

export const TYPE_OPTIONS: { value: SearchType, label: string }[] = [
    { value: 'folder', label: 'Folders' },
    { value: 'document', label: 'Documents' },
    { value: 'image', label: 'Images' },
    { value: 'video', label: 'Videos' },
    { value: 'audio', label: 'Audio' },
    { value: 'other', label: 'Other files' },
]

export const MODIFIED_OPTIONS: { value: Exclude<ModifiedPreset, 'custom'>, label: string }[] = [
    { value: 'today', label: 'Today' },
    { value: '7d', label: 'Last 7 days' },
    { value: '30d', label: 'Last 30 days' },
    { value: 'this-year', label: `This year (${new Date().getFullYear()})` },
    { value: 'last-year', label: `Last year (${new Date().getFullYear() - 1})` },
]

export const LOCATION_OPTIONS: { value: SearchLocation, label: string }[] = [
    { value: 'anywhere', label: 'Anywhere in StoreIt' },
    { value: 'mine', label: 'My files' },
    { value: 'shared', label: 'Shared with me' },
    { value: 'starred', label: 'Starred' },
    { value: 'trash', label: 'Trash' },
]

export const OWNER_OPTIONS: { value: OwnerFilter, label: string }[] = [
    { value: 'anyone', label: 'Anyone' },
    { value: 'me', label: 'Owned by me' },
    { value: 'others', label: 'Not owned by me' },
]

const TYPE_VALUES = new Set(TYPE_OPTIONS.map((o) => o.value))
const MODIFIED_VALUES = new Set<string>([...MODIFIED_OPTIONS.map((o) => o.value), 'custom'])
const LOCATION_VALUES = new Set(LOCATION_OPTIONS.map((o) => o.value))
const OWNER_VALUES = new Set(OWNER_OPTIONS.map((o) => o.value))
const DATE = /^\d{4}-\d{2}-\d{2}$/

type Params = URLSearchParams | Record<string, string | string[] | undefined>

const read = (params: Params, key: string) => {
    if (params instanceof URLSearchParams) return params.get(key)
    const value = params[key]
    return Array.isArray(value) ? value[0] ?? null : value ?? null
}

// Unknown values are dropped rather than rejected, so an edited or old link still searches
export const parseFilters = (params: Params): SearchFilters => {
    const modified = read(params, 'modified')
    const from = read(params, 'from')
    const to = read(params, 'to')
    const location = read(params, 'location')
    const owner = read(params, 'owner')
    const isCustom = modified === 'custom' && ((from && DATE.test(from)) || (to && DATE.test(to)))
    return {
        q: (read(params, 'q') ?? '').trim().slice(0, 200),
        types: [...new Set((read(params, 'type') ?? '').split(',').filter((t): t is SearchType => TYPE_VALUES.has(t as SearchType)))],
        modified: modified && MODIFIED_VALUES.has(modified) && (modified !== 'custom' || isCustom) ? modified as ModifiedPreset : null,
        from: isCustom && from && DATE.test(from) ? from : null,
        to: isCustom && to && DATE.test(to) ? to : null,
        location: location && LOCATION_VALUES.has(location as SearchLocation) ? location as SearchLocation : 'anywhere',
        owner: owner && OWNER_VALUES.has(owner as OwnerFilter) ? owner as OwnerFilter : 'anyone',
    }
}

export const toQueryString = (filters: SearchFilters) => {
    const params = new URLSearchParams()
    if (filters.q) params.set('q', filters.q)
    if (filters.types.length) params.set('type', filters.types.join(','))
    if (filters.modified) params.set('modified', filters.modified)
    if (filters.modified === 'custom') {
        if (filters.from) params.set('from', filters.from)
        if (filters.to) params.set('to', filters.to)
    }
    if (filters.location !== 'anywhere') params.set('location', filters.location)
    if (filters.owner !== 'anyone') params.set('owner', filters.owner)
    return params.toString()
}

export const searchHref = (filters: Partial<SearchFilters>) => `/search?${toQueryString({ ...EMPTY_FILTERS, ...filters })}`

export const hasFilters = (f: SearchFilters) =>
    f.types.length > 0 || f.modified !== null || f.location !== 'anywhere' || f.owner !== 'anyone'

// [from, to) in ISO for the modified filter; day boundaries use the server's time zone
export const modifiedRange = (f: Pick<SearchFilters, 'modified' | 'from' | 'to'>, now = new Date()): [string | null, string | null] => {
    const day = (y: number, m: number, d: number) => new Date(y, m, d).toISOString()
    const y = now.getFullYear(), m = now.getMonth(), d = now.getDate()
    switch (f.modified) {
        case 'today': return [day(y, m, d), null]
        case '7d': return [day(y, m, d - 6), null]
        case '30d': return [day(y, m, d - 29), null]
        case 'this-year': return [day(y, 0, 1), null]
        case 'last-year': return [day(y - 1, 0, 1), day(y, 0, 1)]
        case 'custom': {
            const parse = (s: string | null, offset = 0) => {
                if (!s) return null
                const [yy, mm, dd] = s.split('-').map(Number)
                return day(yy, mm - 1, dd + offset)
            }
            return [parse(f.from), parse(f.to, 1)]
        }
        default: return [null, null]
    }
}

export const modifiedLabel = (f: Pick<SearchFilters, 'modified' | 'from' | 'to'>) => {
    if (f.modified === 'custom') {
        if (f.from && f.to) return `${f.from} – ${f.to}`
        return f.from ? `After ${f.from}` : `Before ${f.to}`
    }
    return MODIFIED_OPTIONS.find((o) => o.value === f.modified)?.label ?? 'Modified'
}

export const typeLabel = (types: SearchType[]) => {
    if (types.length === 0) return 'Type'
    const first = TYPE_OPTIONS.find((o) => o.value === types[0])?.label ?? types[0]
    return types.length === 1 ? first : `${first} +${types.length - 1}`
}

// Splits a name around the first case-insensitive match, so the match can be shown in bold
export const splitMatch = (name: string, q: string): [string, string, string] => {
    const at = q ? name.toLowerCase().indexOf(q.toLowerCase()) : -1
    if (at < 0) return [name, '', '']
    return [name.slice(0, at), name.slice(at, at + q.length), name.slice(at + q.length)]
}

// ---------------------------------------------------------------- Recent searches (this browser only)

const RECENT_KEY = 'storeit:recent-searches'
const RECENT_MAX = 6

export const readRecentSearches = (): string[] => {
    try {
        const value = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]')
        return Array.isArray(value) ? value.filter((v) => typeof v === 'string').slice(0, RECENT_MAX) : []
    } catch {
        return []
    }
}

const writeRecent = (list: string[]) => {
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, RECENT_MAX))) } catch { }
}

export const rememberSearch = (q: string) => {
    const value = q.trim()
    if (!value) return
    writeRecent([value, ...readRecentSearches().filter((s) => s.toLowerCase() !== value.toLowerCase())])
}

export const forgetSearch = (q: string) => writeRecent(readRecentSearches().filter((s) => s !== q))
