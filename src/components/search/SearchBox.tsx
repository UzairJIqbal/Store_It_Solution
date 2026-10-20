'use client'
import React, { useCallback, useEffect, useId, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useDebounce } from 'use-debounce'
import { Clock, Folder, Loader2, Search as SearchIcon, SlidersHorizontal, X } from 'lucide-react'
import Thumbnail from '@/components/Thumbnail'
import { useLifecycle } from '@/components/lifecycle/LifecycleProvider'
import { cn, formatDateTime } from '@/lib/utils'
import {
    EMPTY_FILTERS, forgetSearch, readRecentSearches, rememberSearch, searchHref, SearchFilters, splitMatch,
} from '@/lib/search'
import type { SearchHit, SearchResult } from '@/lib/appwrite/actions/discover'
import AdvancedSearch from './AdvancedSearch'

const SUGGESTION_LIMIT = 6
const DEBOUNCE_MS = 200

// One-click filters in the open panel. Drive shows Type / People / Modified menus here; StoreIt skips a step.
const QUICK_FILTERS: { label: string, filters: Partial<SearchFilters> }[] = [
    { label: 'Folders', filters: { types: ['folder'] } },
    { label: 'Documents', filters: { types: ['document'] } },
    { label: 'Images', filters: { types: ['image'] } },
    { label: 'Videos', filters: { types: ['video'] } },
    { label: 'Starred', filters: { location: 'starred' } },
    { label: 'Last 7 days', filters: { modified: '7d' } },
]

type Option =
    | { kind: 'recent', id: string, q: string }
    | { kind: 'hit', id: string, hit: SearchHit }

const isTypingTarget = (target: EventTarget | null) =>
    target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))

export const Highlight = ({ text, q }: { text: string, q: string }) => {
    const [before, match, after] = splitMatch(text, q)
    return <>{before}{match && <strong className='font-bold text-light-100'>{match}</strong>}{after}</>
}

const hitName = (hit: SearchHit) => (hit.kind === 'file' ? hit.file.name : hit.folder.name)

const SearchBox = () => {
    const router = useRouter()
    const pathname = usePathname()
    const params = useSearchParams()
    const { openPreview } = useLifecycle()
    const listId = useId()
    const root = useRef<HTMLDivElement>(null)
    const input = useRef<HTMLInputElement>(null)

    const [query, setQuery] = useState('')
    const [open, setOpen] = useState(false)
    const [active, setActive] = useState(-1)
    const [recent, setRecent] = useState<string[]>([])
    const [result, setResult] = useState<{ q: string, hits: SearchHit[] } | null>(null)
    const [loading, setLoading] = useState(false)
    const [failed, setFailed] = useState(false)
    const [advanced, setAdvanced] = useState(false)
    const [debounced] = useDebounce(query.trim(), DEBOUNCE_MS)

    // On the results page the box shows the query being looked at
    const urlQuery = pathname === '/search' ? params.get('q') ?? '' : ''
    useEffect(() => { setQuery(urlQuery) }, [urlQuery])

    // A navigation closes the panel
    useEffect(() => { setOpen(false) }, [pathname, params])

    useEffect(() => {
        if (!open || !debounced) {
            setLoading(false)
            return
        }
        const controller = new AbortController()
        setLoading(true)
        setFailed(false)
        fetch(`/api/search?q=${encodeURIComponent(debounced)}&limit=${SUGGESTION_LIMIT}`, { signal: controller.signal })
            .then((res) => (res.ok ? res.json() as Promise<SearchResult> : Promise.reject(new Error(String(res.status)))))
            .then((data) => setResult({ q: debounced, hits: data.hits }))
            .catch((error) => { if (error?.name !== 'AbortError') setFailed(true) })
            .finally(() => { if (!controller.signal.aborted) setLoading(false) })
        return () => controller.abort()
    }, [debounced, open])

    // "/" jumps to search from anywhere, as in most file apps
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return
            if (document.querySelector('[role="dialog"]')) return
            e.preventDefault()
            input.current?.focus()
        }
        window.addEventListener('keydown', onKeyDown)
        return () => window.removeEventListener('keydown', onKeyDown)
    }, [])

    useEffect(() => {
        if (!open) return
        const onPointerDown = (e: PointerEvent) => {
            if (!root.current?.contains(e.target as Node)) setOpen(false)
        }
        document.addEventListener('pointerdown', onPointerDown)
        return () => document.removeEventListener('pointerdown', onPointerDown)
    }, [open])

    const typed = query.trim()
    const showingHits = typed.length > 0
    const hits = showingHits && result?.q === debounced ? result.hits : []
    const options: Option[] = showingHits
        ? hits.map((hit) => ({ kind: 'hit', id: `${hit.kind}-${hit.kind === 'file' ? hit.file.$id : hit.folder.$id}`, hit }))
        : recent.map((q) => ({ kind: 'recent', id: `recent-${q}`, q }))

    useEffect(() => setActive(-1), [debounced, showingHits])

    const openPanel = () => {
        setRecent(readRecentSearches())
        setOpen(true)
    }

    const runSearch = useCallback((filters: Partial<SearchFilters> = {}) => {
        const q = filters.q ?? typed
        rememberSearch(q)
        setOpen(false)
        input.current?.blur()
        router.push(searchHref({ ...EMPTY_FILTERS, ...filters, q }))
    }, [router, typed])

    const choose = (option: Option) => {
        if (option.kind === 'recent') {
            setQuery(option.q)
            return runSearch({ q: option.q })
        }
        rememberSearch(typed)
        setOpen(false)
        const { hit } = option
        if (hit.kind === 'folder') return router.push(hit.folder.trashedAt ? '/trash' : `/folders/${hit.folder.$id}`)
        if (hit.file.trashedAt) return router.push('/trash')
        const files = hits.flatMap((h) => (h.kind === 'file' && !h.file.trashedAt ? [h.file] : []))
        openPreview(files, files.findIndex((f) => f.$id === hit.file.$id))
    }

    const removeRecent = (q: string) => {
        forgetSearch(q)
        setRecent(readRecentSearches())
        setActive(-1)
    }

    const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        // From the results page, ↓ with the panel closed moves into the results
        if (!open && e.key === 'ArrowDown' && pathname === '/search') {
            const first = document.querySelector<HTMLElement>('[data-search-row]')
            if (first) {
                e.preventDefault()
                first.focus()
                return
            }
        }
        switch (e.key) {
            case 'ArrowDown':
            case 'ArrowUp': {
                e.preventDefault()
                if (!open) return openPanel()
                if (options.length === 0) return
                const step = e.key === 'ArrowDown' ? 1 : -1
                setActive((i) => {
                    // Wraps through "no option" (-1), like a native combobox
                    const next = i + step
                    if (next >= options.length) return -1
                    if (next < -1) return options.length - 1
                    return next
                })
                return
            }
            case 'Enter': {
                e.preventDefault()
                if (open && active >= 0 && options[active]) return choose(options[active])
                if (typed) return runSearch()
                return
            }
            case 'Escape': {
                if (open) {
                    e.preventDefault()
                    setOpen(false)
                } else if (query) {
                    e.preventDefault()
                    setQuery('')
                }
                return
            }
            case 'Delete': {
                // Shift+Delete forgets the highlighted recent search
                const option = options[active]
                if (e.shiftKey && option?.kind === 'recent') {
                    e.preventDefault()
                    removeRecent(option.q)
                }
                return
            }
            case 'Tab':
                setOpen(false)
        }
    }

    const activeId = open && active >= 0 && options[active] ? `${listId}-${options[active].id}` : undefined

    return (
        <div className='search' ref={root}>
            <div className={cn('search-input-wrapper', open && 'search-input-open')}>
                <SearchIcon className='size-5 shrink-0 text-light-200' aria-hidden />
                <input
                    ref={input}
                    type='text'
                    role='combobox'
                    aria-label='Search in StoreIt'
                    aria-expanded={open}
                    aria-controls={listId}
                    aria-autocomplete='list'
                    aria-activedescendant={activeId}
                    placeholder='Search in StoreIt'
                    className='search-input'
                    value={query}
                    autoComplete='off'
                    spellCheck={false}
                    onChange={(e) => {
                        setQuery(e.target.value)
                        if (!open) openPanel()
                    }}
                    onFocus={openPanel}
                    onKeyDown={onKeyDown}
                />
                {loading && <Loader2 className='size-4 shrink-0 animate-spin text-light-200' aria-hidden />}
                {query ? (
                    <button type='button' className='search-icon-btn' aria-label='Clear search'
                        onClick={() => { setQuery(''); input.current?.focus() }}>
                        <X className='size-4' aria-hidden />
                    </button>
                ) : (
                    <kbd className='search-kbd' aria-hidden>/</kbd>
                )}
                <button type='button' className='search-icon-btn' aria-label='Advanced search' title='Advanced search'
                    onClick={() => { setOpen(false); setAdvanced(true) }}>
                    <SlidersHorizontal className='size-4' aria-hidden />
                </button>
            </div>

            {open && (
                <div className='search-panel'>
                    <div role='toolbar' aria-label='Quick filters' className='flex flex-wrap gap-2 px-4 pt-3'>
                        {QUICK_FILTERS.map(({ label, filters }) => (
                            <button key={label} type='button' className='search-chip'
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => runSearch(filters)}>
                                {label}
                            </button>
                        ))}
                    </div>

                    {!showingHits && recent.length > 0 && <p className='caption px-4 pb-1 pt-3 text-light-200' id={`${listId}-label`}>Recent searches</p>}
                    <ul role='listbox' id={listId} aria-label='Suggestions' className='search-options'>
                        {options.map((option, index) => {
                            const id = `${listId}-${option.id}`
                            const selected = index === active
                            const common = {
                                id,
                                role: 'option' as const,
                                'aria-selected': selected,
                                className: cn('search-option', selected && 'search-option-active'),
                                onMouseDown: (e: React.MouseEvent) => e.preventDefault(),
                                onMouseMove: () => setActive(index),
                                onClick: () => choose(option),
                            }
                            if (option.kind === 'recent') {
                                return (
                                    <li key={option.id} {...common} aria-label={`Search for "${option.q}"`}>
                                        <Clock className='size-4 shrink-0 text-light-200' aria-hidden />
                                        <span className='body-2 flex-1 truncate text-light-100'>{option.q}</span>
                                        <button type='button' tabIndex={-1} className='search-icon-btn' aria-label={`Remove "${option.q}" from recent searches`}
                                            onClick={(e) => { e.stopPropagation(); removeRecent(option.q) }}>
                                            <X className='size-3.5' aria-hidden />
                                        </button>
                                    </li>
                                )
                            }
                            const { hit } = option
                            const name = hitName(hit)
                            const verb = hit.kind === 'folder' ? 'Open folder' : `Open ${hit.file.type}`
                            return (
                                <li key={option.id} {...common} aria-label={`${verb} "${name}"`}>
                                    {hit.kind === 'folder'
                                        ? <span className='search-folder-icon'><Folder className='size-4' aria-hidden /></span>
                                        : <Thumbnail type={hit.file.type} extension={hit.file.extension} url={hit.file.url} className='!size-8 shrink-0' imageClassName='!size-5' />}
                                    <span className='min-w-0 flex-1'>
                                        <span className='body-2 block truncate text-light-100/80'><Highlight text={name} q={typed} /></span>
                                        <span className='caption block truncate text-light-200'>
                                            {hit.kind === 'file' ? hit.file.ownerId?.fullName ?? 'Me' : 'Folder'} · {hit.location.label}
                                        </span>
                                    </span>
                                    <span className='caption shrink-0 text-light-200'>
                                        {formatDateTime(hit.kind === 'file' ? hit.file.$updatedAt : hit.folder.$updatedAt)}
                                    </span>
                                </li>
                            )
                        })}
                    </ul>

                    <p className='sr-only' aria-live='polite'>
                        {showingHits && !loading && result?.q === debounced ? `${hits.length} suggestions` : ''}
                    </p>
                    {showingHits && !loading && result?.q === debounced && hits.length === 0 && !failed && (
                        <p className='body-2 px-4 py-3 text-light-200'>No names match “{typed}”. Press Enter to search everywhere.</p>
                    )}
                    {failed && <p className='body-2 px-4 py-3 text-error'>Search isn&apos;t responding. Try again.</p>}
                    {!showingHits && recent.length === 0 && (
                        <p className='body-2 px-4 py-3 text-light-200'>Type a name, or pick a filter above.</p>
                    )}

                    <div className='search-panel-footer'>
                        <button type='button' className='search-text-btn' onMouseDown={(e) => e.preventDefault()}
                            onClick={() => { setOpen(false); setAdvanced(true) }}>
                            Advanced search
                        </button>
                        <button type='button' className='search-text-btn' disabled={!typed} onMouseDown={(e) => e.preventDefault()}
                            onClick={() => runSearch()}>
                            <kbd className='search-kbd'>↵</kbd> All results
                        </button>
                    </div>
                </div>
            )}

            <AdvancedSearch
                open={advanced}
                onOpenChange={setAdvanced}
                initial={pathname === '/search' ? undefined : { q: typed }}
            />
        </div>
    )
}

export default SearchBox
