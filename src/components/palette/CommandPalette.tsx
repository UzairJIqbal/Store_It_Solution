'use client'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { useTheme } from 'next-themes'
import { useDebounce } from 'use-debounce'
import {
    ArrowLeft, ChevronRight, CornerDownLeft, Download, Eye, Folder, FolderOpen, FolderPlus, Inbox, Info, LogOut,
    MapPin, Moon, Search, Star, Sun, Trash2, Upload, UserPlus,
} from 'lucide-react'
import Thumbnail from '@/components/Thumbnail'
import { OPEN_UPLOAD_PICKER_EVENT } from '@/components/FileUploader'
import { useLifecycle } from '@/components/lifecycle/LifecycleProvider'
import { starFileWithUndo, trashFileWithUndo } from '@/components/ActionDropdown'
import { switchTheme } from '@/components/brand/ThemeToggle'
import { signOutUser } from '@/lib/appwrite/actions/user.action'
import type { SearchHit } from '@/lib/appwrite/actions/discover'
import { NEW_FOLDER_EVENT, OPEN_PALETTE_EVENT } from '@/lib/events'
import { searchHref } from '@/lib/search'
import { cn, fileDownloadUrl, formatDateTime } from '@/lib/utils'
import { navItems } from '../../../constants'
import { fileDocument } from '../../../types'

type Command = {
    id: string,
    group: string,
    label: string,
    hint?: string,
    keywords?: string,
    icon: React.ReactNode,
    // Files and folders can be opened up into their own list of actions
    hit?: SearchHit,
    run: () => void,
}

// Letters must appear in order; earlier, word-start and consecutive matches score higher. 0 means no match
const fuzzyScore = (text: string, query: string) => {
    const t = text.toLowerCase()
    const q = query.toLowerCase().trim()
    if (!q) return 1
    if (t.includes(q)) return 100 - t.indexOf(q)
    let score = 0, at = -1, run = 0
    for (const ch of q) {
        if (ch === ' ') continue
        const next = t.indexOf(ch, at + 1)
        if (next < 0) return 0
        run = next === at + 1 ? run + 1 : 0
        score += 1 + run * 2 + (next === 0 || t[next - 1] === ' ' ? 3 : 0)
        at = next
    }
    return score
}

export const isMacLike = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent)

const CommandPalette = () => {
    const router = useRouter()
    const path = usePathname()
    const { resolvedTheme, setTheme } = useTheme()
    const { openPreview, openDetails, openShare } = useLifecycle()

    const [open, setOpen] = useState(false)
    const [query, setQuery] = useState('')
    const [debounced] = useDebounce(query, 150)
    const [hits, setHits] = useState<SearchHit[]>([])
    const [searching, setSearching] = useState(false)
    const [active, setActive] = useState(0)
    // When set, the list shows what you can do with this one file or folder
    const [focusHit, setFocusHit] = useState<SearchHit | null>(null)
    const listRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLInputElement>(null)

    const close = useCallback(() => setOpen(false), [])
    const refresh = useCallback(() => router.refresh(), [router])

    // ⌘K / Ctrl+K from anywhere, even while typing; the header button sends an event
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'k') {
                e.preventDefault()
                setOpen((o) => !o)
            }
        }
        const onOpen = () => setOpen(true)
        window.addEventListener('keydown', onKeyDown)
        window.addEventListener(OPEN_PALETTE_EVENT, onOpen)
        return () => {
            window.removeEventListener('keydown', onKeyDown)
            window.removeEventListener(OPEN_PALETTE_EVENT, onOpen)
        }
    }, [])

    useEffect(() => {
        if (open) return
        setQuery('')
        setHits([])
        setFocusHit(null)
        setActive(0)
    }, [open])

    // Files come from the same search the header uses, a few at a time
    useEffect(() => {
        const q = debounced.trim()
        if (!open || !q) {
            setHits([])
            setSearching(false)
            return
        }
        const controller = new AbortController()
        setSearching(true)
        fetch(`/api/search?q=${encodeURIComponent(q)}&limit=6`, { signal: controller.signal })
            .then((r) => (r.ok ? r.json() : { hits: [] }))
            .then((data: { hits?: SearchHit[] }) => setHits(data.hits ?? []))
            .catch(() => { })
            .finally(() => { if (!controller.signal.aborted) setSearching(false) })
        return () => controller.abort()
    }, [debounced, open])

    const openHit = useCallback((hit: SearchHit) => {
        if (hit.kind === 'folder') return router.push(hit.folder.trashedAt ? '/trash' : `/folders/${hit.folder.$id}`)
        if (hit.file.trashedAt) return router.push('/trash')
        const files = hits.flatMap((h) => (h.kind === 'file' && !h.file.trashedAt ? [h.file] : []))
        openPreview(files, files.findIndex((f) => f.$id === hit.file.$id))
    }, [hits, openPreview, router])

    const commands = useMemo<Command[]>(() => {
        const act = (fn: () => void) => () => { close(); fn() }

        if (focusHit) {
            if (focusHit.kind === 'folder') {
                const folder = focusHit.folder
                return [
                    { id: 'f-open', group: folder.name, label: 'Open folder', icon: <FolderOpen />, run: act(() => openHit(focusHit)) },
                    { id: 'f-details', group: folder.name, label: 'Show details', icon: <Info />, run: act(() => openDetails({ kind: 'folder', folder })) },
                ]
            }
            const file: fileDocument = focusHit.file
            const role = file.role ?? 'owner'
            const canEdit = role === 'owner' || role === 'editor'
            const group = file.name
            const list: (Command | false)[] = [
                { id: 'a-open', group, label: 'Open preview', icon: <Eye />, run: act(() => openHit(focusHit)) },
                !file.trashedAt && {
                    id: 'a-star', group, label: file.isStarred ? 'Remove from Starred' : 'Add to Starred', icon: <Star />,
                    run: act(() => starFileWithUndo(file, !file.isStarred, path, refresh)),
                },
                { id: 'a-download', group, label: 'Download', icon: <Download />, run: act(() => { window.location.href = fileDownloadUrl(file.$id) }) },
                canEdit && !file.trashedAt && { id: 'a-share', group, label: 'Share…', icon: <UserPlus />, run: act(() => openShare(file)) },
                { id: 'a-details', group, label: 'Show details', icon: <Info />, run: act(() => openDetails({ kind: 'file', file })) },
                focusHit.location.href ? {
                    id: 'a-location', group, label: `Show in ${focusHit.location.label}`, icon: <MapPin />,
                    run: act(() => router.push(focusHit.location.href!)),
                } : false,
                role === 'owner' && !file.trashedAt && {
                    id: 'a-trash', group, label: 'Move to trash', icon: <Trash2 />, run: act(() => trashFileWithUndo(file, path, refresh)),
                },
            ]
            return list.filter((c): c is Command => Boolean(c)).filter((c) => fuzzyScore(c.label, query) > 0)
        }

        const q = query.trim()
        const inBrowser = path === '/files' || path.startsWith('/folders/')
        const dark = resolvedTheme === 'dark'
        const actions: Command[] = [
            { id: 'upload', group: 'Actions', label: 'Upload files', keywords: 'add new', icon: <Upload />, run: act(() => window.dispatchEvent(new Event(OPEN_UPLOAD_PICKER_EVENT))) },
            {
                id: 'folder', group: 'Actions', label: 'New folder', keywords: 'create make directory', icon: <FolderPlus />,
                run: act(() => (inBrowser ? window.dispatchEvent(new Event(NEW_FOLDER_EVENT)) : router.push('/files?new=folder'))),
            },
            { id: 'drop', group: 'Actions', label: 'Create a drop link', keywords: 'receive collect request files anyone public', icon: <Inbox />, run: act(() => router.push('/drops?new=1')) },
            {
                id: 'theme', group: 'Actions', label: dark ? 'Switch to light theme' : 'Switch to dark theme', keywords: 'appearance mode night day',
                icon: dark ? <Sun /> : <Moon />, run: act(() => switchTheme(dark ? 'light' : 'dark', setTheme)),
            },
            { id: 'signout', group: 'Actions', label: 'Sign out', keywords: 'log out logout', icon: <LogOut />, run: act(() => { void signOutUser() }) },
        ]
        const pages: Command[] = [
            ...navItems.map((n) => ({
                id: `nav-${n.url}`, group: 'Go to', label: n.name, keywords: 'page open view',
                // The nav icons are white artwork tinted with CSS
                icon: <img src={n.icon} alt='' className='palette-nav-icon' />,
                run: act(() => router.push(n.url)),
            })),
        ]

        const ranked = (list: Command[]) => list
            .map((c) => ({ c, s: Math.max(fuzzyScore(c.label, q), fuzzyScore(`${c.label} ${c.keywords ?? ''}`, q) * 0.6) }))
            .filter((x) => x.s > 0)
            .sort((a, b) => b.s - a.s)
            .map((x) => x.c)

        const files: Command[] = hits.map((hit) => {
            const name = hit.kind === 'file' ? hit.file.name : hit.folder.name
            const updated = hit.kind === 'file' ? hit.file.$updatedAt : hit.folder.$updatedAt
            return {
                id: `hit-${hit.kind}-${hit.kind === 'file' ? hit.file.$id : hit.folder.$id}`,
                group: 'Files',
                label: name,
                hint: `${hit.location.label} · ${formatDateTime(updated)}`,
                icon: hit.kind === 'folder'
                    ? <Folder />
                    : <Thumbnail type={hit.file.type} extension={hit.file.extension} url={hit.file.url} className='!size-7 shrink-0' imageClassName='!size-5' />,
                hit,
                run: act(() => openHit(hit)),
            }
        })
        const searchAll: Command[] = q ? [{
            id: 'search-all', group: 'Files', label: `Search everywhere for “${q}”`, icon: <Search />,
            run: act(() => router.push(searchHref({ q }))),
        }] : []

        // With no query, actions come first; while typing, matching files lead
        return q
            ? [...files, ...searchAll, ...ranked(actions), ...ranked(pages)]
            : [...actions, ...pages]
    }, [focusHit, query, path, resolvedTheme, hits, close, openHit, openDetails, openShare, refresh, router, setTheme])

    useEffect(() => setActive(0), [query, focusHit, hits])

    useEffect(() => {
        listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
    }, [active])

    const drillIn = (command?: Command) => {
        if (!command?.hit) return false
        setFocusHit(command.hit)
        setQuery('')
        return true
    }

    const onKeyDown = (e: React.KeyboardEvent) => {
        const count = commands.length
        switch (e.key) {
            case 'ArrowDown': e.preventDefault(); setActive((a) => (count ? (a + 1) % count : 0)); break
            case 'ArrowUp': e.preventDefault(); setActive((a) => (count ? (a - 1 + count) % count : 0)); break
            case 'Home': if (!query) { e.preventDefault(); setActive(0) } break
            case 'End': if (!query) { e.preventDefault(); setActive(Math.max(count - 1, 0)) } break
            case 'Enter': e.preventDefault(); commands[active]?.run(); break
            case 'Tab':
            case 'ArrowRight': {
                const at = e.currentTarget instanceof HTMLInputElement ? e.currentTarget.selectionStart : null
                if (e.key === 'ArrowRight' && at !== null && at < query.length) break
                if (drillIn(commands[active])) e.preventDefault()
                else if (e.key === 'Tab') e.preventDefault()
                break
            }
            case 'Backspace':
            case 'ArrowLeft':
                if (focusHit && !query) {
                    e.preventDefault()
                    setFocusHit(null)
                }
                break
        }
    }

    // Group headings appear where the group changes
    let lastGroup = ''
    const activeId = commands[active] ? `palette-${commands[active].id}` : undefined

    return (
        <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
            <DialogPrimitive.Portal>
                <DialogPrimitive.Overlay className='palette-overlay' />
                <DialogPrimitive.Content className='palette' aria-describedby={undefined}
                    onOpenAutoFocus={(e) => { e.preventDefault(); inputRef.current?.focus() }}>
                    <DialogPrimitive.Title className='sr-only'>Command palette</DialogPrimitive.Title>
                    <div className='palette-input-row'>
                        {focusHit
                            ? (
                                <button type='button' className='palette-back' onClick={() => { setFocusHit(null); inputRef.current?.focus() }}
                                    aria-label='Back to all commands'>
                                    <ArrowLeft className='size-4' aria-hidden />
                                </button>
                            )
                            : <Search className='size-5 shrink-0 text-light-200' aria-hidden />}
                        {focusHit && (
                            <span className='palette-scope'>
                                {focusHit.kind === 'file' ? focusHit.file.name : focusHit.folder.name}
                            </span>
                        )}
                        <input
                            ref={inputRef}
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            onKeyDown={onKeyDown}
                            placeholder={focusHit ? 'Filter actions…' : 'Search files, pages and actions…'}
                            className='palette-input'
                            role='combobox'
                            aria-expanded
                            aria-controls='palette-list'
                            aria-activedescendant={activeId}
                            aria-autocomplete='list'
                            autoComplete='off'
                            spellCheck={false}
                        />
                        {searching && <span className='palette-spinner' aria-label='Searching' />}
                        <kbd className='palette-kbd'>esc</kbd>
                    </div>

                    <div ref={listRef} id='palette-list' role='listbox' aria-label='Commands' className='palette-list'>
                        {commands.length === 0 && (
                            <p className='palette-empty'>{searching ? 'Searching…' : 'No matches. Try another word.'}</p>
                        )}
                        {commands.map((c, i) => {
                            const heading = c.group !== lastGroup ? c.group : null
                            lastGroup = c.group
                            return (
                                <React.Fragment key={c.id}>
                                    {heading && <p className='palette-group' role='presentation'>{heading}</p>}
                                    <div
                                        id={`palette-${c.id}`}
                                        role='option'
                                        aria-selected={i === active}
                                        data-index={i}
                                        className={cn('palette-item', i === active && 'palette-item-active')}
                                        onMouseMove={() => i !== active && setActive(i)}
                                        onClick={() => c.run()}
                                    >
                                        <span className='palette-item-icon'>{c.icon}</span>
                                        <span className='min-w-0 flex-1'>
                                            <span className='block truncate'>{c.label}</span>
                                            {c.hint && <span className='palette-item-hint'>{c.hint}</span>}
                                        </span>
                                        {c.hit && (
                                            <button type='button' className='palette-more' tabIndex={-1}
                                                aria-label={`Actions for ${c.label}`}
                                                onClick={(e) => { e.stopPropagation(); drillIn(c); inputRef.current?.focus() }}>
                                                <ChevronRight className='size-4' aria-hidden />
                                            </button>
                                        )}
                                        {i === active && !c.hit && <CornerDownLeft className='size-4 shrink-0 text-light-200' aria-hidden />}
                                    </div>
                                </React.Fragment>
                            )
                        })}
                    </div>

                    <div className='palette-footer' aria-hidden>
                        <span><kbd>↑</kbd><kbd>↓</kbd> move</span>
                        <span><kbd>↵</kbd> run</span>
                        <span><kbd>→</kbd> file actions</span>
                        {focusHit && <span><kbd>←</kbd> back</span>}
                    </div>
                </DialogPrimitive.Content>
            </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
    )
}

// The header's search-style button that opens the palette and shows its shortcut
export const PaletteButton = ({ className }: { className?: string }) => {
    const [mac, setMac] = useState(true)
    useEffect(() => setMac(isMacLike()), [])
    return (
        <button type='button' className={cn('palette-button', className)} onClick={() => window.dispatchEvent(new Event(OPEN_PALETTE_EVENT))}
            aria-label='Open command palette' title='Command palette'>
            <kbd>{mac ? '⌘' : 'Ctrl'}</kbd><kbd>K</kbd>
        </button>
    )
}

export default CommandPalette
