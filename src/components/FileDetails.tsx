'use client'
import React, { useEffect, useState } from 'react'
import { FolderClosed, Loader2 } from 'lucide-react'
import { fileDocument, FolderDocument } from '../../types'
import Thumbnail from './Thumbnail'
import SmartTags from './smart/SmartTags'
import { cn, convertFileSize, formatDateTime } from '@/lib/utils'
import type { ActivityEntry, FileDetailsData } from '@/lib/appwrite/actions/lifecycle.action'

// Fetches one of the read-only /api routes; they return the same { ok, data, error } shape as the actions
const load = async <T,>(url: string): Promise<{ ok: boolean, data?: T, error?: string }> => {
    try {
        return await (await fetch(url, { cache: 'no-store' })).json()
    } catch {
        return { ok: false, error: "Couldn't reach StoreIt. Check your connection and try again." }
    }
}

export type DetailsTarget = { kind: 'file', file: fileDocument } | { kind: 'folder', folder: FolderDocument }

const Row = ({ label, value }: { label: string, value: React.ReactNode }) => (
    <div className='details-row'>
        <dt className='details-label'>{label}</dt>
        <dd className='details-value'>{value}</dd>
    </div>
)

const quoted = (value: unknown) => `"${String(value ?? '')}"`

// One line per event, in the words the feed uses: "<who> <did what>"
export const describeActivity = (entry: ActivityEntry) => {
    const d = entry.detail
    switch (entry.action) {
        case 'upload': return d.copiedFrom ? `made a copy of ${quoted(d.copiedFrom)}` : 'uploaded this item'
        case 'rename': return `renamed ${quoted(d.from)} to ${quoted(d.to)}`
        case 'move': return `moved this item to ${quoted(d.to ?? 'My Files')}`
        case 'share': return `shared with ${d.email} as ${d.role === 'editor' ? 'an editor' : 'a viewer'}`
        case 'role': return `changed ${d.email} to ${d.role === 'editor' ? 'editor' : 'viewer'}`
        case 'unshare': return `removed ${d.email}'s access`
        case 'link': return d.access === 'anyone' ? 'turned on link sharing' : 'turned off link sharing'
        case 'transfer': return `made ${d.email} the owner`
        case 'trash': return 'moved this item to the trash'
        case 'restore': return 'restored this item from the trash'
        case 'version': return `uploaded version ${d.number}${d.uploadedName ? ` (${d.uploadedName})` : ''}`
        case 'version_delete': return `deleted version ${d.number}`
        default: return 'made a change'
    }
}

// Groups events by day, newest first, like the activity feed it is modelled on
const dayLabel = (iso: string) => {
    const date = new Date(iso)
    const today = new Date()
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
    if (date.getTime() >= start) return 'Today'
    if (date.getTime() >= start - 86_400_000) return 'Yesterday'
    return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric' })
}

export const ActivityFeed = ({ target }: { target: DetailsTarget }) => {
    const [entries, setEntries] = useState<ActivityEntry[] | null>(null)
    const [error, setError] = useState<string | null>(null)
    const id = target.kind === 'file' ? target.file.$id : target.folder.$id

    useEffect(() => {
        let alive = true
        setEntries(null)
        setError(null)
        load<ActivityEntry[]>(target.kind === 'file' ? `/api/files/${id}/activity` : `/api/folders/${id}/activity`).then((result) => {
            if (!alive) return
            if (result.ok) setEntries(result.data ?? [])
            else setError(result.error ?? "Something went wrong")
        })
        return () => { alive = false }
    }, [id, target.kind])

    if (error) return <p className='body-2 py-6 text-center text-light-200'>{error}</p>
    if (!entries) return <div className='flex-center py-8'><Loader2 className='size-5 animate-spin text-brand' aria-label='Loading activity' /></div>
    if (entries.length === 0) return <p className='body-2 py-6 text-center text-light-200'>No activity yet</p>

    const groups = new Map<string, ActivityEntry[]>()
    for (const entry of entries) {
        const label = dayLabel(entry.at)
        groups.set(label, [...(groups.get(label) ?? []), entry])
    }
    return (
        <div className='flex flex-col gap-5'>
            {[...groups].map(([label, rows]) => (
                <section key={label}>
                    <h3 className='caption mb-2 font-semibold uppercase tracking-wide text-light-200'>{label}</h3>
                    <ol className='flex flex-col gap-3'>
                        {rows.map((entry) => (
                            <li key={entry.id} className='activity-item'>
                                <span className='activity-avatar' aria-hidden>{(entry.isMe ? 'You' : entry.actorName).slice(0, 1).toUpperCase()}</span>
                                <div className='min-w-0'>
                                    <p className='body-2 text-light-100'>
                                        <span className='font-semibold'>{entry.isMe ? 'You' : entry.actorName}</span> {describeActivity(entry)}
                                    </p>
                                    {entry.fileName && <p className='caption truncate text-light-200'>{entry.fileName}</p>}
                                    <p className='caption text-light-200'>{formatDateTime(entry.at)}</p>
                                </div>
                            </li>
                        ))}
                    </ol>
                </section>
            ))}
        </div>
    )
}

const FileFields = ({ file }: { file: fileDocument }) => {
    const [data, setData] = useState<FileDetailsData | null>(null)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        let alive = true
        setData(null)
        load<FileDetailsData>(`/api/files/${file.$id}/details`).then((result) => {
            if (!alive) return
            if (result.ok) setData(result.data!)
            else setError(result.error ?? "Something went wrong")
        })
        return () => { alive = false }
    }, [file.$id])

    if (error) return <p className='body-2 py-6 text-center text-light-200'>{error}</p>
    const current = data?.file ?? file
    const access = data
        ? [
            data.sharedWith ? `Shared with ${data.sharedWith} ${data.sharedWith === 1 ? 'person' : 'people'}` : 'Private to the owner',
            data.linkOn && 'anyone with the link can view',
        ].filter(Boolean).join(', ')
        : '…'
    return (
        <>
        <SmartTags key={`${current.$id}-${current.tags?.join(',') ?? ''}`} file={current} />
        <dl className='flex flex-col'>
            <Row label='Type' value={`${current.extension ? current.extension.toUpperCase() : 'File'} · ${current.type}`} />
            <Row label='Size' value={convertFileSize(current.size)} />
            <Row label='Storage used' value={data ? convertFileSize(data.storageUsed) : '…'} />
            <Row label='Location' value={data?.location ?? '…'} />
            <Row label='Owner' value={current.role && current.role !== 'owner' ? current.ownerId?.fullName ?? 'Someone else' : 'me'} />
            <Row label='Who has access' value={access} />
            <Row label='Modified' value={formatDateTime(current.currentVersionAt ?? current.$updatedAt)} />
            <Row label='Opened by me' value={data ? (data.openedAt ? formatDateTime(data.openedAt) : 'Never') : '…'} />
            <Row label='Created' value={formatDateTime(current.$createdAt)} />
            <Row label='Versions' value={data ? String(data.versions) : '…'} />
            {current.trashedAt && <Row label='Moved to trash' value={formatDateTime(current.trashedAt)} />}
        </dl>
        </>
    )
}

const FolderFields = ({ folder }: { folder: FolderDocument }) => (
    <dl className='flex flex-col'>
        <Row label='Type' value='Folder' />
        <Row label='Owner' value='me' />
        <Row label='Modified' value={formatDateTime(folder.$updatedAt)} />
        <Row label='Created' value={formatDateTime(folder.$createdAt)} />
    </dl>
)

// The Details / Activity panel for one file or folder
const FileDetails = ({ target, initialTab = 'details', className }: {
    target: DetailsTarget,
    initialTab?: 'details' | 'activity',
    className?: string,
}) => {
    const [tab, setTab] = useState<'details' | 'activity'>(initialTab)
    const name = target.kind === 'file' ? target.file.name : target.folder.name

    return (
        <div className={cn('flex min-h-0 flex-col gap-4', className)}>
            <div className='flex items-center gap-3'>
                {target.kind === 'file'
                    ? <Thumbnail type={target.file.type} extension={target.file.extension} url={target.file.url} className='!size-11 shrink-0' imageClassName='!size-7' />
                    : <span className='thumbnail !size-11 shrink-0'><FolderClosed className='size-6 fill-brand/80 text-brand' aria-hidden /></span>}
                <p className='subtitle-1 min-w-0 break-words text-light-100'>{name}</p>
            </div>
            <div className='details-tabs' role='tablist' aria-label='Details panel'>
                {(['details', 'activity'] as const).map((value) => (
                    <button
                        key={value}
                        type='button'
                        role='tab'
                        id={`details-tab-${value}`}
                        aria-selected={tab === value}
                        aria-controls={`details-panel-${value}`}
                        className={cn('details-tab', tab === value && 'details-tab-active')}
                        onClick={() => setTab(value)}
                    >
                        {value === 'details' ? 'Details' : 'Activity'}
                    </button>
                ))}
            </div>
            <div role='tabpanel' id={`details-panel-${tab}`} aria-labelledby={`details-tab-${tab}`} className='min-h-0 flex-1 overflow-y-auto pr-1'>
                {tab === 'details'
                    ? (target.kind === 'file' ? <FileFields file={target.file} /> : <FolderFields folder={target.folder} />)
                    : <ActivityFeed target={target} />}
            </div>
        </div>
    )
}

export default FileDetails
