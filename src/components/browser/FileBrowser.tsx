'use client'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import {
    ArrowDown, ArrowUp, ArrowUpDown, Copy, Download, Eye, FolderClosed, FolderInput, FolderOpen, FolderPlus, History,
    Info, Keyboard, LayoutGrid, List, MoreVertical, Pencil, Plus, Star, Trash2, Upload, UserPlus, Users, X,
} from 'lucide-react'
import { toast } from 'sonner'
import { errorToast, undoToast } from '@/lib/undo'
import {
    DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
    DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import Thumbnail from '@/components/Thumbnail'
import { OPEN_UPLOAD_PICKER_EVENT } from '@/components/FileUploader'
import { NEW_FOLDER_EVENT } from '@/lib/events'
import { cn, convertFileSize, fileDownloadUrl, formatDateTime } from '@/lib/utils'
import { Crumb, fileDocument, FolderDocument } from '../../../types'
import {
    BrowserItem, DEFAULT_SORT, describeItems, ITEM_DRAG_TYPE, itemKey, SortField, SortState, sortItems, sourceOf, toItems, ViewMode,
} from './items'
import { useBrowserActions } from './actions'
import Breadcrumbs, { Trail } from './Breadcrumbs'
import BrowserDialogs, { DialogState } from './BrowserDialogs'
import { useLifecycle } from '@/components/lifecycle/LifecycleProvider'
import { copyFile } from '@/lib/appwrite/actions/copy.action'
import { downloadZip } from '@/lib/zip-download'
import FolderFilters, { filterItems, FolderFilterState, hasFolderFilters, NO_FOLDER_FILTERS } from './FolderFilters'

interface Props {
    folder: FolderDocument | null,
    breadcrumbs: Crumb[],
    folders: FolderDocument[],
    files: fileDocument[],
}

type MenuState = { x: number, y: number, target: 'items' | 'background' } | null
type Rect = { left: number, top: number, right: number, bottom: number }
type Direction = 'up' | 'down' | 'left' | 'right'

const VIEW_KEY = 'storeit:browser-view'
const SORT_KEY = 'storeit:browser-sort'
const DRAG_THRESHOLD = 4
const SORT_FIELDS: { field: SortField, label: string, asc: string, desc: string }[] = [
    { field: 'name', label: 'Name', asc: 'A to Z', desc: 'Z to A' },
    { field: 'modified', label: 'Last modified', asc: 'Oldest first', desc: 'Newest first' },
    { field: 'size', label: 'File size', asc: 'Smallest first', desc: 'Largest first' },
]

const isTypingTarget = (target: EventTarget | null) =>
    target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))

const intersects = (a: Rect, b: DOMRect) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top

const ItemIcon = ({ item, large }: { item: BrowserItem, large?: boolean }) =>
    item.kind === 'folder'
        ? <FolderClosed className={cn('shrink-0 fill-brand/80 text-brand', large ? 'size-7' : 'size-6')} aria-hidden />
        : <Thumbnail type={item.file!.type} extension={item.file!.extension} url={item.file!.url} className='!size-9 shrink-0' imageClassName='!size-6' />

const FileBrowser = ({ folder, breadcrumbs, folders, files }: Props) => {
    const router = useRouter()
    const pathname = usePathname()
    const { moveItems, trashItems, restoreItems, toggleStar, folderHref } = useBrowserActions()
    const { openPreview, openDetails, openVersions, openShare } = useLifecycle()

    const [view, setView] = useState<ViewMode>('list')
    const [sort, setSort] = useState<SortState>(DEFAULT_SORT)
    const [prefsLoaded, setPrefsLoaded] = useState(false)
    const [selected, setSelected] = useState<Set<string>>(new Set())
    const [anchor, setAnchor] = useState<string | null>(null)
    const [focusKey, setFocusKey] = useState<string | null>(null)
    const [menu, setMenu] = useState<MenuState>(null)
    const [dialog, setDialog] = useState<DialogState>(null)
    const [dragKeys, setDragKeys] = useState<Set<string>>(new Set())
    // undefined: no drop target; null: the root crumb; string: a folder id
    const [dropTarget, setDropTarget] = useState<string | null | undefined>(undefined)
    const [marquee, setMarquee] = useState<Rect | null>(null)

    const contentRef = useRef<HTMLDivElement>(null)
    const marqueeStart = useRef<{ x: number, y: number, base: Set<string>, moved: boolean } | null>(null)

    // Preferences are per browser; read them after hydration so server and client markup match
    useEffect(() => {
        try {
            const storedView = localStorage.getItem(VIEW_KEY)
            if (storedView === 'list' || storedView === 'grid') setView(storedView)
            const storedSort = JSON.parse(localStorage.getItem(SORT_KEY) ?? 'null')
            if (storedSort && SORT_FIELDS.some((f) => f.field === storedSort.field) && ['asc', 'desc'].includes(storedSort.direction)) {
                setSort({ field: storedSort.field, direction: storedSort.direction, foldersFirst: storedSort.foldersFirst !== false })
            }
        } catch { /* storage unavailable: keep defaults */ }
        setPrefsLoaded(true)
    }, [])

    useEffect(() => {
        if (!prefsLoaded) return
        try {
            localStorage.setItem(VIEW_KEY, view)
            localStorage.setItem(SORT_KEY, JSON.stringify(sort))
        } catch { /* storage unavailable */ }
    }, [view, sort, prefsLoaded])

    const [filters, setFilters] = useState<FolderFilterState>(NO_FOLDER_FILTERS)
    const filtering = hasFolderFilters(filters)
    const sorted = useMemo(() => filterItems(sortItems(toItems(folders, files), sort), filters), [folders, files, sort, filters])
    const gridFolders = useMemo(() => sorted.filter((i) => i.kind === 'folder'), [sorted])
    const gridFiles = useMemo(() => sorted.filter((i) => i.kind === 'file'), [sorted])
    // Grid view always groups folders above files; keyboard and shift ranges follow what is on screen
    const displayItems = useMemo(() => (view === 'grid' ? [...gridFolders, ...gridFiles] : sorted), [view, sorted, gridFolders, gridFiles])
    const selectedItems = useMemo(() => displayItems.filter((i) => selected.has(i.key)), [displayItems, selected])

    // Forget selections of items that were moved or deleted
    useEffect(() => {
        const keys = new Set(displayItems.map((i) => i.key))
        setSelected((prev) => {
            const next = new Set([...prev].filter((k) => keys.has(k)))
            return next.size === prev.size ? prev : next
        })
        setFocusKey((prev) => (prev && keys.has(prev) ? prev : null))
    }, [displayItems])

    const currentItem: BrowserItem | null = useMemo(() => folder && toItems([folder], [])[0], [folder])
    const trail: Trail[] = useMemo(() => [
        { id: null, name: 'My Files' },
        ...breadcrumbs.map((c) => ({ id: c.id, name: c.name })),
        ...(folder ? [{ id: folder.$id, name: folder.name }] : []),
    ], [breadcrumbs, folder])

    const itemElements = useCallback(
        () => Array.from(contentRef.current?.querySelectorAll<HTMLElement>('[data-item-key]') ?? []),
        [],
    )

    const rangeKeys = useCallback((from: string, to: string) => {
        const a = displayItems.findIndex((i) => i.key === from)
        const b = displayItems.findIndex((i) => i.key === to)
        if (a < 0 || b < 0) return [to]
        return displayItems.slice(Math.min(a, b), Math.max(a, b) + 1).map((i) => i.key)
    }, [displayItems])

    const selectOnly = (key: string) => {
        setSelected(new Set([key]))
        setAnchor(key)
        setFocusKey(key)
    }

    const clearSelection = () => {
        setSelected(new Set())
        setAnchor(null)
    }

    // Files open in the viewer, which steps through the other files in this folder in the order shown
    const openItem = (item: BrowserItem) => {
        if (item.kind === 'folder') return router.push(folderHref(item.id))
        const fileItems = displayItems.filter((i) => i.file)
        openPreview(fileItems.map((i) => i.file!), fileItems.findIndex((i) => i.key === item.key))
    }

    const showDetails = (item: BrowserItem) =>
        openDetails(item.file ? { kind: 'file', file: item.file } : { kind: 'folder', folder: item.folder! })

    // Stars belong to files; with a mixed selection the star follows the first file
    const starTargets = (targets: BrowserItem[]) => targets.filter((i) => i.file)
    const performStar = async (targets: BrowserItem[]) => {
        const files = starTargets(targets)
        if (files.length === 0) return
        const starred = !files[0].file!.isStarred
        const results = await Promise.all(files.map((i) => toggleStar({ fileId: i.id, starred, path: pathname })))
        const failed = results.find((r) => !r.ok)
        if (failed && !failed.ok) errorToast(failed.error)
        else undoToast(starred ? `Added ${describeItems(files)} to Starred` : `Removed ${describeItems(files)} from Starred`, async () => {
            const undo = await Promise.all(files.map((i) => toggleStar({ fileId: i.id, starred: !starred, path: pathname })))
            const undoFailed = undo.find((r) => !r.ok)
            if (undoFailed && !undoFailed.ok) errorToast(undoFailed.error)
            router.refresh()
        })
        router.refresh()
    }

    // One file downloads as itself; folders or several files come down as one ZIP
    const download = (targets: BrowserItem[]) => {
        if (targets.length > 1 || targets.some((t) => t.kind === 'folder')) {
            const name = targets.length === 1 ? targets[0].name : folder ? `${folder.name} items` : 'StoreIt download'
            return void downloadZip({
                folderIds: targets.filter((t) => t.kind === 'folder').map((t) => t.id),
                fileIds: targets.filter((t) => t.kind === 'file').map((t) => t.id),
                name,
            })
        }
        targets.filter((i) => i.file).forEach((item, index) => {
            // Browsers drop rapid back-to-back downloads, so space them out
            setTimeout(() => {
                const link = document.createElement('a')
                link.href = fileDownloadUrl(item.file!.$id)
                link.download = item.name
                document.body.appendChild(link)
                link.click()
                link.remove()
            }, index * 300)
        })
    }

    const performCopy = async (item: BrowserItem) => {
        const id = toast.loading(`Copying "${item.name}"…`)
        const result = await copyFile({ fileId: item.id, path: pathname })
        if (!result.ok) {
            toast.dismiss(id)
            return errorToast(result.error)
        }
        toast.success(`Created "${result.data!.name}"`, { id })
        router.refresh()
    }

    const openUploadPicker = () => window.dispatchEvent(new Event(OPEN_UPLOAD_PICKER_EVENT))

    const performMove = async (moving: BrowserItem[], targetId: string | null, targetName: string) => {
        if (moving.length === 0) return false
        const source = sourceOf(moving[0])
        const ids = {
            fileIds: moving.filter((i) => i.kind === 'file').map((i) => i.id),
            folderIds: moving.filter((i) => i.kind === 'folder').map((i) => i.id),
        }
        const result = await moveItems({ ...ids, targetFolderId: targetId, path: pathname })
        if (!result.ok) {
            errorToast(result.error)
            return false
        }
        clearSelection()
        undoToast(`Moved ${describeItems(moving)} to "${targetName}"`, async () => {
            const undo = await moveItems({ ...ids, targetFolderId: source, path: pathname })
            if (!undo.ok) errorToast(undo.error)
            else toast('Move undone')
            router.refresh()
        }, { cancel: { label: 'Open folder', onClick: () => router.push(folderHref(targetId)) } })
        router.refresh()
        return true
    }

    // No confirmation: items go to the trash for 30 days and the toast offers Undo
    const performTrash = async (targets: BrowserItem[]) => {
        const ids = {
            fileIds: targets.filter((i) => i.kind === 'file').map((i) => i.id),
            folderIds: targets.filter((i) => i.kind === 'folder').map((i) => i.id),
        }
        const result = await trashItems({ ...ids, path: pathname })
        if (!result.ok) {
            errorToast(result.error)
            return false
        }
        clearSelection()
        undoToast(`${describeItems(targets)} moved to trash`, async () => {
            const undo = await restoreItems({ ...ids, path: pathname })
            if (!undo.ok) errorToast(undo.error)
            else toast('Restored from trash')
            router.refresh()
        }, { cancel: { label: 'Open trash', onClick: () => router.push('/trash') } })
        if (folder && targets.some((t) => t.kind === 'folder' && t.id === folder.$id)) router.push(folderHref(folder.parentId))
        else router.refresh()
        return true
    }

    // ---- Pointer selection -------------------------------------------------

    const onItemClick = (e: React.MouseEvent, item: BrowserItem) => {
        e.stopPropagation()
        const touch = (e.nativeEvent as PointerEvent).pointerType === 'touch'
        if (touch && selected.size === 0) return openItem(item)

        const toggle = e.metaKey || e.ctrlKey
        if (e.shiftKey) {
            const range = rangeKeys(anchor ?? item.key, item.key)
            setSelected(new Set([...(toggle ? selected : []), ...range]))
            setFocusKey(item.key)
            if (!anchor) setAnchor(item.key)
        } else if (toggle || touch) {
            setSelected((prev) => {
                const next = new Set(prev)
                if (next.has(item.key)) next.delete(item.key)
                else next.add(item.key)
                return next
            })
            setAnchor(item.key)
            setFocusKey(item.key)
        } else {
            selectOnly(item.key)
        }
    }

    const onBackgroundMouseDown = (e: React.MouseEvent) => {
        if (e.button !== 0) return
        // React events bubble out of portals (menus, dialogs); only react to the browser's own DOM
        if (!e.currentTarget.contains(e.target as Node)) return
        if ((e.target as HTMLElement).closest('[data-item-key], button, a, input')) return
        e.preventDefault()
        const additive = e.metaKey || e.ctrlKey || e.shiftKey
        marqueeStart.current = { x: e.clientX, y: e.clientY, base: additive ? new Set(selected) : new Set(), moved: false }
    }

    useEffect(() => {
        const onMove = (e: MouseEvent) => {
            const start = marqueeStart.current
            if (!start) return
            if (!start.moved && Math.hypot(e.clientX - start.x, e.clientY - start.y) < DRAG_THRESHOLD) return
            start.moved = true
            const rect = {
                left: Math.min(start.x, e.clientX), right: Math.max(start.x, e.clientX),
                top: Math.min(start.y, e.clientY), bottom: Math.max(start.y, e.clientY),
            }
            setMarquee(rect)
            const hits = itemElements().filter((el) => intersects(rect, el.getBoundingClientRect())).map((el) => el.dataset.itemKey!)
            setSelected(new Set([...start.base, ...hits]))
            if (hits.length) setFocusKey(hits[hits.length - 1])
        }
        const onUp = () => {
            const start = marqueeStart.current
            if (!start) return
            marqueeStart.current = null
            setMarquee(null)
            // A plain click on empty space clears the selection
            if (!start.moved) setSelected(start.base)
        }
        window.addEventListener('mousemove', onMove)
        window.addEventListener('mouseup', onUp)
        return () => {
            window.removeEventListener('mousemove', onMove)
            window.removeEventListener('mouseup', onUp)
        }
    }, [itemElements])

    // ---- Context menu -----------------------------------------------------

    // The menu opens under the pointer on mousedown; the release of that same press must not activate an item
    const menuOpenedAt = useRef(0)
    const showMenu = (next: NonNullable<MenuState>) => {
        menuOpenedAt.current = performance.now()
        setMenu(next)
    }

    const openItemMenu = (x: number, y: number, item: BrowserItem) => {
        if (!selected.has(item.key)) selectOnly(item.key)
        showMenu({ x, y, target: 'items' })
    }

    const onItemContextMenu = (e: React.MouseEvent, item: BrowserItem) => {
        e.preventDefault()
        e.stopPropagation()
        openItemMenu(e.clientX, e.clientY, item)
    }

    const onBackgroundContextMenu = (e: React.MouseEvent) => {
        if (!e.currentTarget.contains(e.target as Node)) return
        if ((e.target as HTMLElement).closest('[data-item-key], button, a, input')) return
        e.preventDefault()
        clearSelection()
        showMenu({ x: e.clientX, y: e.clientY, target: 'background' })
    }

    const openMenuAt = (el: HTMLElement, target: 'items' | 'background' = 'items') => {
        const rect = el.getBoundingClientRect()
        showMenu({ x: rect.left, y: rect.bottom, target })
    }

    // ---- Drag to move ------------------------------------------------------

    const onItemDragStart = (e: React.DragEvent, item: BrowserItem) => {
        const keys = selected.has(item.key) ? new Set(selected) : new Set([item.key])
        if (!selected.has(item.key)) selectOnly(item.key)
        setDragKeys(keys)
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData(ITEM_DRAG_TYPE, JSON.stringify([...keys]))

        const chip = document.createElement('div')
        chip.className = 'drag-chip'
        chip.textContent = keys.size === 1 ? item.name : `${keys.size} items`
        document.body.appendChild(chip)
        e.dataTransfer.setDragImage(chip, 16, 16)
        requestAnimationFrame(() => chip.remove())
    }

    const endDrag = () => {
        setDragKeys(new Set())
        setDropTarget(undefined)
    }

    // The current folder and the dragged folders themselves are never valid destinations
    const canDropOn = (id: string | null) =>
        dragKeys.size > 0 && id !== (folder?.$id ?? null) && !(id && dragKeys.has(itemKey('folder', id)))

    const dropProps = (id: string | null, name: string): React.HTMLAttributes<HTMLElement> => ({
        onDragOver: (e) => {
            if (!e.dataTransfer.types.includes(ITEM_DRAG_TYPE) || !canDropOn(id)) return
            e.preventDefault()
            e.dataTransfer.dropEffect = 'move'
            if (dropTarget !== id) setDropTarget(id)
        },
        onDragLeave: (e) => {
            if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
            setDropTarget((prev) => (prev === id ? undefined : prev))
        },
        onDrop: (e) => {
            if (!canDropOn(id)) return
            e.preventDefault()
            e.stopPropagation()
            let keys: string[] = []
            try { keys = JSON.parse(e.dataTransfer.getData(ITEM_DRAG_TYPE)) } catch { /* foreign payload */ }
            const moving = displayItems.filter((i) => keys.includes(i.key))
            endDrag()
            performMove(moving, id, name)
        },
    })

    // ---- Keyboard ----------------------------------------------------------

    const neighbour = (fromKey: string, direction: Direction) => {
        const elements = itemElements()
        const from = elements.find((el) => el.dataset.itemKey === fromKey)
        if (!from) return null
        const r = from.getBoundingClientRect()
        const cx = r.left + r.width / 2
        const cy = r.top + r.height / 2
        let best: string | null = null
        let bestScore = Infinity
        for (const el of elements) {
            if (el === from) continue
            const o = el.getBoundingClientRect()
            const dx = o.left + o.width / 2 - cx
            const dy = o.top + o.height / 2 - cy
            let primary: number
            let secondary: number
            if (direction === 'up' || direction === 'down') {
                if (direction === 'up' ? dy >= -r.height / 2 : dy <= r.height / 2) continue
                primary = Math.abs(dy)
                secondary = Math.abs(dx)
            } else {
                if (Math.abs(dy) >= r.height / 2 || (direction === 'left' ? dx >= 0 : dx <= 0)) continue
                primary = Math.abs(dx)
                secondary = 0
            }
            // Nearest row (or column) first, then the closest item within it
            const score = Math.round(primary / 8) * 100000 + secondary
            if (score < bestScore) {
                bestScore = score
                best = el.dataset.itemKey!
            }
        }
        return best
    }

    const keyHandler = useRef<(e: KeyboardEvent) => void>(() => { })
    keyHandler.current = (e: KeyboardEvent) => {
        if (dialog || menu || isTypingTarget(e.target) || document.querySelector('[role="dialog"], [role="menu"]')) return
        const mod = e.metaKey || e.ctrlKey
        const { key } = e

        if (key === 'Escape') {
            if (selected.size) clearSelection()
            return
        }
        // ⌥⌘S / Alt+Ctrl+S: add to or remove from Starred
        if (mod && e.altKey && e.code === 'KeyS') {
            if (selectedItems.some((i) => i.file)) {
                e.preventDefault()
                performStar(selectedItems)
            }
            return
        }
        if (mod && key.toLowerCase() === 'a') {
            e.preventDefault()
            setSelected(new Set(displayItems.map((i) => i.key)))
            return
        }
        const edge = key === 'Home' ? displayItems[0] : key === 'End' ? displayItems[displayItems.length - 1] : undefined
        if (edge && !mod && !e.altKey) {
            e.preventDefault()
            setFocusKey(edge.key)
            if (e.shiftKey) {
                const start = anchor ?? focusKey ?? edge.key
                setAnchor(start)
                setSelected(new Set(rangeKeys(start, edge.key)))
            } else {
                setSelected(new Set([edge.key]))
                setAnchor(edge.key)
            }
            return
        }
        if (key.startsWith('Arrow')) {
            if (e.altKey) {
                if (key === 'ArrowUp' && folder) {
                    e.preventDefault()
                    router.push(folderHref(folder.parentId))
                }
                return
            }
            if (mod || displayItems.length === 0) return
            e.preventDefault()
            const direction = key.slice(5).toLowerCase() as Direction
            const from = focusKey ?? anchor
            const next = from ? neighbour(from, direction) ?? from : displayItems[0].key
            setFocusKey(next)
            if (e.shiftKey) {
                const start = anchor ?? from ?? next
                setAnchor(start)
                setSelected(new Set(rangeKeys(start, next)))
            } else {
                setSelected(new Set([next]))
                setAnchor(next)
            }
            return
        }
        if (mod || e.altKey) return

        const single = selectedItems.length === 1 ? selectedItems[0] : null
        const focused = displayItems.find((i) => i.key === focusKey)
        const run = (action: () => void) => {
            e.preventDefault()
            action()
        }

        if ((key === 'ContextMenu' || (key === 'F10' && e.shiftKey)) && focused) {
            const el = itemElements().find((x) => x.dataset.itemKey === focused.key)
            if (el) run(() => openItemMenu(el.getBoundingClientRect().left + 24, el.getBoundingClientRect().bottom, focused))
            return
        }

        switch (key) {
            case 'Enter': if (single ?? focused) run(() => openItem((single ?? focused)!)); break
            case ' ':
                if (focused) run(() => {
                    setSelected((prev) => {
                        const next = new Set(prev)
                        if (next.has(focused.key)) next.delete(focused.key)
                        else next.add(focused.key)
                        return next
                    })
                    setAnchor(focused.key)
                })
                break
            case 'F2': if (single) run(() => setDialog({ type: 'rename', item: single })); break
            case 'Delete':
            case 'Backspace': if (selectedItems.length) run(() => performTrash(selectedItems)); break
            case 'n': run(() => setDialog({ type: 'new-folder' })); break
            case 'u': run(openUploadPicker); break
            case 'm': if (selectedItems.length) run(() => setDialog({ type: 'move', items: selectedItems })); break
            case 'v': run(() => setView((v) => (v === 'list' ? 'grid' : 'list'))); break
            case 'i': if (single) run(() => showDetails(single)); break
            case '/': run(() => document.querySelector<HTMLInputElement>('.search-input')?.focus()); break
            case '?': run(() => setDialog({ type: 'shortcuts' })); break
        }
    }

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => keyHandler.current(e)
        window.addEventListener('keydown', onKeyDown)
        return () => window.removeEventListener('keydown', onKeyDown)
    }, [])

    // The command palette asks for a new folder here; it may have navigated first, so it also leaves ?new=folder
    useEffect(() => {
        const openNewFolder = () => setDialog({ type: 'new-folder' })
        const url = new URL(window.location.href)
        if (url.searchParams.get('new') === 'folder') {
            url.searchParams.delete('new')
            window.history.replaceState(null, '', url)
            openNewFolder()
        }
        window.addEventListener(NEW_FOLDER_EVENT, openNewFolder)
        return () => window.removeEventListener(NEW_FOLDER_EVENT, openNewFolder)
    }, [])

    // Keep the keyboard focus on the focused item so screen readers follow it
    useEffect(() => {
        if (!focusKey || dialog || menu) return
        const el = itemElements().find((x) => x.dataset.itemKey === focusKey)
        if (el && document.activeElement !== el && !isTypingTarget(document.activeElement)) {
            el.focus({ preventScroll: true })
            el.scrollIntoView({ block: 'nearest' })
        }
    }, [focusKey, dialog, menu, itemElements])

    // ---- Rendering ----------------------------------------------------------

    const itemProps = (item: BrowserItem, className: string) => {
        const isSelected = selected.has(item.key)
        return {
            'data-item-key': item.key,
            role: 'option',
            'aria-selected': isSelected,
            tabIndex: focusKey === item.key || (!focusKey && item === displayItems[0]) ? 0 : -1,
            onFocus: () => setFocusKey(item.key),
            draggable: true,
            onClick: (e: React.MouseEvent) => onItemClick(e, item),
            onDoubleClick: () => openItem(item),
            onContextMenu: (e: React.MouseEvent) => onItemContextMenu(e, item),
            onDragStart: (e: React.DragEvent) => onItemDragStart(e, item),
            onDragEnd: endDrag,
            ...(item.kind === 'folder' ? {
                ...dropProps(item.id, item.name),
                // Files dragged in from the computer can be dropped straight into this folder
                'data-upload-folder-row': '',
                'data-upload-folder-id': item.id,
                'data-upload-folder-name': item.name,
            } : {}),
            className: cn(
                className,
                isSelected && 'is-selected',
                dragKeys.has(item.key) && 'is-dragging',
                item.kind === 'folder' && dropTarget === item.id && 'drop-target-active',
            ),
        }
    }

    // Called as a function, not rendered as <MoreButton>: a component defined in render gets a new identity each
    // render, so focusing the row on mousedown would remount the button and swallow the click
    const moreButton = (item: BrowserItem) => (
        <button
            type='button'
            tabIndex={-1}
            draggable={false}
            className='item-more-btn'
            aria-label={`More actions for ${item.name}`}
            onClick={(e) => {
                e.stopPropagation()
                openItemMenu(e.currentTarget.getBoundingClientRect().left, e.currentTarget.getBoundingClientRect().bottom, item)
            }}
            onDoubleClick={(e) => e.stopPropagation()}
        >
            <MoreVertical className='size-5' aria-hidden />
        </button>
    )

    const itemActions = (targets: BrowserItem[]) => {
        if (targets.length === 0) return null
        const single = targets.length === 1 ? targets[0] : null
        const withFiles = targets.filter((t) => t.file)
        return (
            <>
                {single && <DropdownMenuItem onSelect={() => openItem(single)}>{single.file ? <Eye /> : <FolderOpen />}Open<DropdownMenuShortcut>Enter</DropdownMenuShortcut></DropdownMenuItem>}
                <DropdownMenuItem onSelect={() => download(targets)}><Download />Download</DropdownMenuItem>
                <DropdownMenuSeparator />
                {single && <DropdownMenuItem onSelect={() => setDialog({ type: 'rename', item: single })}><Pencil />Rename<DropdownMenuShortcut>F2</DropdownMenuShortcut></DropdownMenuItem>}
                {single?.file && <DropdownMenuItem onSelect={() => performCopy(single)}><Copy />Make a copy</DropdownMenuItem>}
                {single?.file && <DropdownMenuItem onSelect={() => openShare(single.file!)}><UserPlus />Share</DropdownMenuItem>}
                <DropdownMenuItem onSelect={() => setDialog({ type: 'move', items: targets })}><FolderInput />Move to…<DropdownMenuShortcut>M</DropdownMenuShortcut></DropdownMenuItem>
                {withFiles.length > 0 && (
                    <DropdownMenuItem onSelect={() => performStar(targets)}>
                        <Star className={cn(withFiles[0].file!.isStarred && 'fill-current')} />
                        {withFiles[0].file!.isStarred ? 'Remove from Starred' : 'Add to Starred'}
                        <DropdownMenuShortcut>⌥⌘S</DropdownMenuShortcut>
                    </DropdownMenuItem>
                )}
                {single && <DropdownMenuItem onSelect={() => showDetails(single)}><Info />Details<DropdownMenuShortcut>I</DropdownMenuShortcut></DropdownMenuItem>}
                {single?.file && <DropdownMenuItem onSelect={() => openVersions(single.file!)}><History />Manage versions</DropdownMenuItem>}
                <DropdownMenuSeparator />
                <DropdownMenuItem className='browser-menu-danger' onSelect={() => performTrash(targets)}>
                    <Trash2 />Move to trash<DropdownMenuShortcut>Del</DropdownMenuShortcut>
                </DropdownMenuItem>
            </>
        )
    }

    const createActions = (
        <>
            <DropdownMenuItem onSelect={() => setDialog({ type: 'new-folder' })}><FolderPlus />New folder<DropdownMenuShortcut>N</DropdownMenuShortcut></DropdownMenuItem>
            <DropdownMenuItem onSelect={openUploadPicker}><Upload />Upload files<DropdownMenuShortcut>U</DropdownMenuShortcut></DropdownMenuItem>
        </>
    )

    const SortHeader = ({ field, label, className }: { field: SortField, label: string, className?: string }) => {
        const active = sort.field === field
        const Arrow = sort.direction === 'asc' ? ArrowUp : ArrowDown
        return (
            <button
                type='button'
                className={cn('browser-list-sort', active && 'text-light-100', className)}
                aria-pressed={active}
                aria-label={`Sort by ${label}${active ? `, ${sort.direction === 'asc' ? 'ascending' : 'descending'}` : ''}`}
                onClick={() => setSort((s) => s.field === field
                    ? { ...s, direction: s.direction === 'asc' ? 'desc' : 'asc' }
                    : { ...s, field, direction: field === 'name' ? 'asc' : 'desc' })}
            >
                {label}
                {active && <Arrow className='size-4' aria-hidden />}
            </button>
        )
    }

    const totalSize = files.reduce((sum, f) => sum + f.size, 0)
    const summary = [
        `${folders.length} ${folders.length === 1 ? 'folder' : 'folders'}`,
        `${files.length} ${files.length === 1 ? 'file' : 'files'}`,
    ].join(', ') + (totalSize ? ` · ${convertFileSize(totalSize)}` : '')
    const sortField = SORT_FIELDS.find((f) => f.field === sort.field)!

    return (
        <div className='browser' onMouseDown={onBackgroundMouseDown} onContextMenu={onBackgroundContextMenu}>
            <div className='browser-header'>
                <Breadcrumbs
                    trail={trail}
                    activeDropId={dropTarget}
                    dropProps={(t) => dropProps(t.id, t.name)}
                    currentMenu={<>{createActions}{currentItem && <><DropdownMenuSeparator />{itemActions([currentItem])}</>}</>}
                />
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button className='browser-new-button'><Plus className='size-5' aria-hidden />New</Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align='end' className='browser-menu'>{createActions}</DropdownMenuContent>
                </DropdownMenu>
            </div>

            <FolderFilters filters={filters} onChange={setFilters} />

            <div className='browser-toolbar'>
                {selectedItems.length > 0 ? (
                    <div className='selection-bar' role='toolbar' aria-label='Selection actions'>
                        <button type='button' className='toolbar-icon-btn' onClick={clearSelection} aria-label='Clear selection' title='Clear selection'>
                            <X className='size-5' aria-hidden />
                        </button>
                        <p className='subtitle-2 mr-2 whitespace-nowrap' aria-live='polite'>{selectedItems.length} selected</p>
                        <span className='toolbar-divider' aria-hidden />
                        <button type='button' className='toolbar-icon-btn' onClick={() => setDialog({ type: 'move', items: selectedItems })} aria-label='Move to' title='Move to'>
                            <FolderInput className='size-5' aria-hidden />
                        </button>
                        <button type='button' className='toolbar-icon-btn' onClick={() => download(selectedItems)} aria-label='Download' title='Download'>
                            <Download className='size-5' aria-hidden />
                        </button>
                        <button type='button' className='toolbar-icon-btn' onClick={() => performTrash(selectedItems)} aria-label='Move to trash' title='Move to trash'>
                            <Trash2 className='size-5' aria-hidden />
                        </button>
                        <button type='button' className='toolbar-icon-btn' onClick={(e) => openMenuAt(e.currentTarget)} aria-label='More actions' title='More actions'>
                            <MoreVertical className='size-5' aria-hidden />
                        </button>
                    </div>
                ) : (
                    <p className='body-2 text-light-200' aria-live='polite'>
                        {filtering ? `${displayItems.length} of ${folders.length + files.length} items match` : summary}
                    </p>
                )}

                <div className='flex items-center gap-2'>
                    <DropdownMenu>
                        <DropdownMenuTrigger className='toolbar-button' aria-label={`Sort by ${sortField.label}, ${sort.direction === 'asc' ? sortField.asc : sortField.desc}`}>
                            <ArrowUpDown className='size-4' aria-hidden />
                            <span className='hidden sm:inline'>{sortField.label}</span>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align='end' className='browser-menu'>
                            <DropdownMenuLabel>Sort by</DropdownMenuLabel>
                            <DropdownMenuRadioGroup value={sort.field} onValueChange={(v) => setSort((s) => ({ ...s, field: v as SortField }))}>
                                {SORT_FIELDS.map((f) => <DropdownMenuRadioItem key={f.field} value={f.field}>{f.label}</DropdownMenuRadioItem>)}
                            </DropdownMenuRadioGroup>
                            <DropdownMenuSeparator />
                            <DropdownMenuLabel>Order</DropdownMenuLabel>
                            <DropdownMenuRadioGroup value={sort.direction} onValueChange={(v) => setSort((s) => ({ ...s, direction: v as SortState['direction'] }))}>
                                <DropdownMenuRadioItem value='asc'>{sortField.asc}</DropdownMenuRadioItem>
                                <DropdownMenuRadioItem value='desc'>{sortField.desc}</DropdownMenuRadioItem>
                            </DropdownMenuRadioGroup>
                            <DropdownMenuSeparator />
                            <DropdownMenuCheckboxItem checked={sort.foldersFirst} onCheckedChange={(c) => setSort((s) => ({ ...s, foldersFirst: c === true }))}>
                                Folders on top
                            </DropdownMenuCheckboxItem>
                        </DropdownMenuContent>
                    </DropdownMenu>

                    <div className='view-toggle' role='radiogroup' aria-label='Layout'>
                        {([['list', List, 'List view'], ['grid', LayoutGrid, 'Grid view']] as const).map(([mode, Icon, label]) => (
                            <button
                                key={mode}
                                type='button'
                                role='radio'
                                aria-checked={view === mode}
                                aria-label={label}
                                title={`${label} (V)`}
                                onClick={() => setView(mode)}
                                className={cn('view-toggle-btn', view === mode && 'view-toggle-btn-active')}
                            >
                                <Icon className='size-5' aria-hidden />
                            </button>
                        ))}
                    </div>

                    <button type='button' className='toolbar-icon-btn' onClick={() => setDialog({ type: 'shortcuts' })} aria-label='Keyboard shortcuts' title='Keyboard shortcuts (?)'>
                        <Keyboard className='size-5' aria-hidden />
                    </button>
                </div>
            </div>

            <div
                ref={contentRef}
                className='browser-content'
                data-upload-current-folder=''
                data-upload-folder-id={folder?.$id ?? ''}
                data-upload-folder-name={folder?.name ?? 'My Files'}
            >
                {displayItems.length === 0 && filtering ? (
                    <div className='browser-empty'>
                        <FolderOpen className='size-16 text-brand/70' aria-hidden />
                        <p className='h4 text-light-100'>No items match these filters</p>
                        <button type='button' className='body-2 font-medium text-brand-100 hover:underline' onClick={() => setFilters(NO_FOLDER_FILTERS)}>
                            Clear filters
                        </button>
                    </div>
                ) : displayItems.length === 0 ? (
                    <div className='browser-empty'>
                        <FolderOpen className='size-16 text-brand/70' aria-hidden />
                        <p className='h4 text-light-100'>This folder is empty</p>
                        <p className='body-2 text-light-200'>Drop files here or use the New button</p>
                    </div>
                ) : view === 'list' ? (
                    <div className='browser-list'>
                        <div className='browser-list-row browser-list-header'>
                            <SortHeader field='name' label='Name' />
                            <span className='hidden md:block' aria-hidden>Owner</span>
                            {/* Wrapped so the visibility class isn't overridden by the button's own display */}
                            <span className='hidden sm:block'><SortHeader field='modified' label='Last modified' /></span>
                            <span className='hidden sm:block'><SortHeader field='size' label='File size' /></span>
                            <span />
                        </div>
                        <div role='listbox' aria-multiselectable aria-label={`Contents of ${trail[trail.length - 1].name}`}>
                            {displayItems.map((item) => (
                                <div key={item.key} {...itemProps(item, 'browser-list-row browser-row')}>
                                    <div className='flex min-w-0 items-center gap-3'>
                                        <ItemIcon item={item} />
                                        <div className='flex min-w-0 flex-col'>
                                            <span className='subtitle-2 flex min-w-0 items-center gap-1'>
                                                <span className='truncate'>{item.name}</span>
                                                {item.file?.isStarred && <Star className='size-3.5 shrink-0 fill-current text-brand' aria-label='Starred' />}
                                                {item.file?.isShared && <Users className='size-3.5 shrink-0 text-light-200' aria-label='Shared' />}
                                            </span>
                                            <span className='caption truncate text-light-200 sm:hidden'>
                                                {formatDateTime(item.modified)}{item.size !== null && ` · ${convertFileSize(item.size)}`}
                                            </span>
                                        </div>
                                    </div>
                                    <span className='body-2 hidden text-light-200 md:block'>me</span>
                                    <span className='body-2 hidden truncate text-light-200 sm:block'>{formatDateTime(item.modified)}</span>
                                    <span className='body-2 hidden text-light-200 sm:block'>{item.size === null ? '—' : convertFileSize(item.size)}</span>
                                    {moreButton(item)}
                                </div>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div role='listbox' aria-multiselectable aria-label={`Contents of ${trail[trail.length - 1].name}`} className='flex flex-col gap-8'>
                        {gridFolders.length > 0 && (
                            <section role='group' aria-label='Folders'>
                                <h2 className='browser-section-title'>Folders</h2>
                                <div className='folder-grid'>
                                    {gridFolders.map((item) => (
                                        <div key={item.key} {...itemProps(item, 'folder-tile')}>
                                            <ItemIcon item={item} large />
                                            <span className='subtitle-2 flex-1 truncate'>{item.name}</span>
                                            {moreButton(item)}
                                        </div>
                                    ))}
                                </div>
                            </section>
                        )}
                        {gridFiles.length > 0 && (
                            <section role='group' aria-label='Files'>
                                <h2 className='browser-section-title'>Files</h2>
                                <div className='file-grid'>
                                    {gridFiles.map((item) => (
                                        <div key={item.key} {...itemProps(item, 'file-tile')}>
                                            <div className='file-tile-header'>
                                                <ItemIcon item={item} />
                                                <span className='subtitle-2 flex-1 truncate'>{item.name}</span>
                                                {item.file?.isStarred && <Star className='size-3.5 shrink-0 fill-current text-brand' aria-label='Starred' />}
                                                {item.file?.isShared && <Users className='size-3.5 shrink-0 text-light-200' aria-label='Shared' />}
                                                {moreButton(item)}
                                            </div>
                                            <div className='file-tile-preview'>
                                                <Thumbnail
                                                    type={item.file!.type}
                                                    extension={item.file!.extension}
                                                    url={item.file!.url}
                                                    className='!size-full !rounded-xl !bg-transparent'
                                                    imageClassName={item.file!.type === 'image' && item.file!.extension !== 'svg' ? '!size-full object-cover !rounded-xl' : '!size-14'}
                                                />
                                            </div>
                                            <p className='caption truncate text-light-200'>
                                                {convertFileSize(item.size ?? 0)} · {formatDateTime(item.modified)}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            </section>
                        )}
                    </div>
                )}
            </div>

            {marquee && (
                <div
                    className='marquee'
                    style={{ left: marquee.left, top: marquee.top, width: marquee.right - marquee.left, height: marquee.bottom - marquee.top }}
                    aria-hidden
                />
            )}

            {/* One menu serves right-click, the ⋮ buttons and the selection bar; it is anchored at the pointer */}
            <DropdownMenu key={menu ? `${menu.x},${menu.y}` : 'closed'} open={menu !== null} onOpenChange={(open) => !open && setMenu(null)} modal={false}>
                <DropdownMenuTrigger asChild>
                    <span aria-hidden className='pointer-events-none fixed size-0' style={{ left: menu?.x ?? 0, top: menu?.y ?? 0 }} />
                </DropdownMenuTrigger>
                <DropdownMenuContent align='start' sideOffset={2} collisionPadding={8} className='browser-menu'
                    onPointerUpCapture={(e) => { if (e.button === 2 || performance.now() - menuOpenedAt.current < 300) e.stopPropagation() }}
                >
                    {menu?.target === 'items' ? itemActions(selectedItems) : (
                        <>
                            {createActions}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onSelect={() => setView((v) => (v === 'list' ? 'grid' : 'list'))}>
                                {view === 'list' ? <LayoutGrid /> : <List />}{view === 'list' ? 'Grid view' : 'List view'}<DropdownMenuShortcut>V</DropdownMenuShortcut>
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => setDialog({ type: 'shortcuts' })}><Keyboard />Keyboard shortcuts<DropdownMenuShortcut>?</DropdownMenuShortcut></DropdownMenuItem>
                        </>
                    )}
                </DropdownMenuContent>
            </DropdownMenu>

            <BrowserDialogs
                dialog={dialog}
                onClose={() => setDialog(null)}
                folderId={folder?.$id ?? null}
                path={pathname}
                onMove={performMove}
            />
        </div>
    )
}

export default FileBrowser
