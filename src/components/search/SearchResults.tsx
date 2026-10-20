'use client'
import React, { useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Folder, SearchX } from 'lucide-react'
import Thumbnail from '@/components/Thumbnail'
import ActionDropdown from '@/components/ActionDropdown'
import { useLifecycle } from '@/components/lifecycle/LifecycleProvider'
import { formatDateTime } from '@/lib/utils'
import { EMPTY_FILTERS, hasFilters, searchHref, SearchFilters } from '@/lib/search'
import type { SearchHit } from '@/lib/appwrite/actions/discover'
import { Highlight } from './SearchBox'

export const SearchEmpty = ({ filters }: { filters: SearchFilters }) => (
    <div className='empty-state'>
        <span className='empty-state-art'><SearchX className='size-10' aria-hidden /></span>
        <h2 className='h3 text-light-100'>Nothing matched your search</h2>
        <p className='body-2 max-w-[420px] text-center text-light-200'>
            {hasFilters(filters)
                ? 'Try removing a filter, or search for part of the name instead of all of it.'
                : 'Check the spelling, or search for part of the name. Filters above can narrow by type, owner, date and place.'}
        </p>
        {hasFilters(filters) && (
            <Link href={searchHref({ ...EMPTY_FILTERS, q: filters.q })} className='search-text-btn'>Clear filters</Link>
        )}
    </div>
)

// Results in a list you can walk with ↑ ↓ Home End; Enter opens, the ⋮ menu has the rest
const SearchResults = ({ hits, filters, hasMore }: { hits: SearchHit[], filters: SearchFilters, hasMore: boolean }) => {
    const router = useRouter()
    const { openPreview } = useLifecycle()
    const list = useRef<HTMLUListElement>(null)
    const openable = hits.flatMap((h) => (h.kind === 'file' && !h.file.trashedAt ? [h.file] : []))

    if (hits.length === 0) return <SearchEmpty filters={filters} />

    const open = (hit: SearchHit) => {
        if (hit.kind === 'folder') return router.push(hit.folder.trashedAt ? '/trash' : `/folders/${hit.folder.$id}`)
        if (hit.file.trashedAt) return router.push('/trash')
        openPreview(openable, openable.findIndex((f) => f.$id === hit.file.$id))
    }

    const onKeyDown = (e: React.KeyboardEvent<HTMLUListElement>) => {
        const rows = [...(list.current?.querySelectorAll<HTMLElement>('[data-search-row]') ?? [])]
        const at = rows.indexOf(document.activeElement as HTMLElement)
        if (at < 0) return
        const target = { ArrowDown: at + 1, ArrowUp: at - 1, Home: 0, End: rows.length - 1 }[e.key]
        if (target === undefined) return
        e.preventDefault()
        if (target < 0) {
            document.querySelector<HTMLInputElement>('input[role="combobox"]')?.focus()
            return
        }
        rows[Math.min(target, rows.length - 1)]?.focus()
    }

    return (
        <div className='w-full'>
            <p className='body-2 mb-3 text-light-200' aria-live='polite'>
                {hits.length}{hasMore ? '+' : ''} {hits.length === 1 ? 'result' : 'results'}
            </p>
            <div className='lifecycle-list-header md:grid-cols-[minmax(0,1fr)_160px_180px_150px_40px]' aria-hidden>
                <p className='subtitle-2'>Name</p>
                <p className='subtitle-2'>Owner</p>
                <p className='subtitle-2'>Location</p>
                <p className='subtitle-2'>Modified</p>
                <span />
            </div>
            <ul ref={list} className='flex flex-col gap-2' onKeyDown={onKeyDown} aria-label='Search results'>
                {hits.map((hit) => {
                    const name = hit.kind === 'file' ? hit.file.name : hit.folder.name
                    const updated = hit.kind === 'file' ? hit.file.$updatedAt : hit.folder.$updatedAt
                    const owner = hit.kind === 'file' ? hit.file.ownerId?.fullName ?? 'Me' : 'Me'
                    return (
                        <li key={hit.kind === 'file' ? hit.file.$id : hit.folder.$id}
                            className='lifecycle-row search-row grid-cols-[minmax(0,1fr)_40px] md:grid-cols-[minmax(0,1fr)_160px_180px_150px_40px]'>
                            <div
                                role='button'
                                tabIndex={0}
                                data-search-row
                                className='flex min-w-0 cursor-pointer items-center gap-3 rounded-lg outline-none'
                                aria-label={`${hit.kind === 'folder' ? 'Open folder' : 'Open'} ${name}, ${hit.location.label}`}
                                onClick={() => open(hit)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault()
                                        open(hit)
                                    }
                                }}
                            >
                                {hit.kind === 'folder'
                                    ? <span className='search-folder-icon !size-10'><Folder className='size-5' aria-hidden /></span>
                                    : <Thumbnail type={hit.file.type} extension={hit.file.extension} url={hit.file.url} className='!size-10 shrink-0' imageClassName='!size-7' />}
                                <div className='min-w-0'>
                                    <p className='subtitle-2 truncate font-normal text-light-100'><Highlight text={name} q={filters.q} /></p>
                                    <p className='caption truncate text-light-200 md:hidden'>{hit.location.label} · {formatDateTime(updated)}</p>
                                    {hit.kind === 'file' && hit.match && (
                                        <p className='search-match'>
                                            {hit.match.kind === 'tag'
                                                ? <>Tagged <span className='smart-tag-inline'>#{hit.match.text}</span></>
                                                : <>Inside: <Highlight text={hit.match.text} q={filters.q} /></>}
                                        </p>
                                    )}
                                </div>
                            </div>
                            <p className='body-2 hidden truncate text-light-100 md:block'>{owner}</p>
                            <p className='body-2 hidden truncate md:block'>
                                {hit.location.href
                                    ? <Link href={hit.location.href} className='text-light-100 hover:underline'>{hit.location.label}</Link>
                                    : hit.location.label}
                            </p>
                            <p className='body-2 hidden text-light-100 md:block'>{formatDateTime(updated)}</p>
                            {hit.kind === 'file' && !hit.file.trashedAt
                                ? <ActionDropdown file={hit.file} files={openable} index={openable.findIndex((f) => f.$id === hit.file.$id)} />
                                : <span />}
                        </li>
                    )
                })}
            </ul>
            {hasMore && <p className='caption mt-4 text-center text-light-200'>Showing the 50 most recently changed matches. Add a filter to narrow it down.</p>}
        </div>
    )
}

export default SearchResults
