"use client"
// Folders under "My Files" in the sidebar, each expandable in place. A disclosure list (buttons with
// aria-expanded plus links), so Tab and Enter work without a custom tree keyboard model.
import Link from 'next/link'
import React, { useEffect, useMemo, useState } from 'react'
import { ChevronRight, FolderClosed } from 'lucide-react'
import { cn } from '@/lib/utils'
import { FolderDocument } from '../../types'

export type TreeFolder = Pick<FolderDocument, "$id" | "name" | "parentId" | "ancestors">

const EXPANDED_KEY = 'storeit:sidebar-tree'
export const ROOT_KEY = 'root'

export const useTreeExpansion = (folders: TreeFolder[], pathname: string) => {
    const [expanded, setExpanded] = useState<Set<string>>(new Set())
    const [loaded, setLoaded] = useState(false)

    useEffect(() => {
        try {
            const saved = JSON.parse(localStorage.getItem(EXPANDED_KEY) ?? '[]')
            if (Array.isArray(saved)) setExpanded(new Set(saved.filter((v) => typeof v === 'string')))
        } catch { /* storage unavailable */ }
        setLoaded(true)
    }, [])

    // Opening a folder anywhere reveals it in the tree
    const currentId = pathname.startsWith('/folders/') ? pathname.split('/')[2] : null
    useEffect(() => {
        const current = folders.find((f) => f.$id === currentId)
        if (!current) return
        setExpanded((prev) => {
            const needed = [ROOT_KEY, ...current.ancestors].filter((id) => !prev.has(id))
            return needed.length ? new Set([...prev, ...needed]) : prev
        })
    }, [currentId, folders])

    useEffect(() => {
        if (!loaded) return
        try {
            localStorage.setItem(EXPANDED_KEY, JSON.stringify([...expanded]))
        } catch { /* storage unavailable */ }
    }, [expanded, loaded])

    const toggle = (id: string) => setExpanded((prev) => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
    })
    return { expanded, toggle, currentId }
}

const byName = (a: TreeFolder, b: TreeFolder) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })

const FolderTree = ({ folders, expanded, toggle, currentId }: {
    folders: TreeFolder[],
    expanded: Set<string>,
    toggle: (id: string) => void,
    currentId: string | null,
}) => {
    const children = useMemo(() => {
        const map = new Map<string | null, TreeFolder[]>()
        folders.forEach((f) => {
            const key = f.parentId ?? null
            map.set(key, [...(map.get(key) ?? []), f])
        })
        map.forEach((list) => list.sort(byName))
        return map
    }, [folders])

    const renderLevel = (parentId: string | null, depth: number): React.ReactNode => {
        const list = children.get(parentId) ?? []
        if (list.length === 0) return null
        return (
            <ul className='flex flex-col gap-0.5'>
                {list.map((f) => {
                    const hasChildren = (children.get(f.$id) ?? []).length > 0
                    const open = expanded.has(f.$id)
                    const current = f.$id === currentId
                    return (
                        <li key={f.$id}>
                            <div className={cn('sidebar-tree-row', current && 'sidebar-tree-row-active')} style={{ paddingLeft: depth * 14 }}>
                                {hasChildren ? (
                                    <button type='button' className='sidebar-tree-toggle' aria-expanded={open}
                                        aria-label={`${open ? 'Collapse' : 'Expand'} ${f.name}`} onClick={() => toggle(f.$id)}>
                                        <ChevronRight className={cn('size-4 transition-transform', open && 'rotate-90')} aria-hidden />
                                    </button>
                                ) : <span className='w-6 shrink-0' aria-hidden />}
                                <Link href={`/folders/${f.$id}`} className='sidebar-tree-link' aria-current={current ? 'page' : undefined}>
                                    <FolderClosed className='size-4 shrink-0' aria-hidden />
                                    <span className='truncate'>{f.name}</span>
                                </Link>
                            </div>
                            {hasChildren && open && renderLevel(f.$id, depth + 1)}
                        </li>
                    )
                })}
            </ul>
        )
    }

    if (!expanded.has(ROOT_KEY)) return null
    const top = renderLevel(null, 0)
    return top ?? <p className='caption px-8 py-1 text-light-200'>No folders yet</p>
}

export default FolderTree
