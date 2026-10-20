import { cleanTag, MAX_CONTENT, MAX_TAGS } from './analyze'

// The browser works the tags out, so the server re-checks their shape before saving them
export const sanitizeSmart = (input: unknown): { tags: string[], content: string | null } | null => {
    if (!input || typeof input !== 'object') return null
    const { tags, content } = input as { tags?: unknown, content?: unknown }
    if (!Array.isArray(tags)) return null
    const clean = [...new Set(tags.filter((t): t is string => typeof t === 'string').map(cleanTag).filter(Boolean))].slice(0, MAX_TAGS)
    const text = typeof content === 'string' && content.trim() ? content.slice(0, MAX_CONTENT) : null
    return { tags: clean, content: text }
}

// A short piece of text around the first match, for showing why a file came up in search
export const matchSnippet = (text: string | null | undefined, q: string, radius = 60) => {
    if (!text || !q) return null
    const at = text.toLowerCase().indexOf(q.toLowerCase())
    if (at < 0) return null
    const start = Math.max(0, at - radius)
    const end = Math.min(text.length, at + q.length + radius)
    return `${start > 0 ? '…' : ''}${text.slice(start, end).replace(/\s+/g, ' ').trim()}${end < text.length ? '…' : ''}`
}
