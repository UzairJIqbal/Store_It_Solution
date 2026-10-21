'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { Check, Copy, ExternalLink, FolderOpen, Inbox, Pause, Play, Plus, Trash2 } from 'lucide-react'
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
    AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { createDrop, deleteDrop, DropExpiry, setDropEnabled } from '@/lib/appwrite/actions/drop.action'
import type { MyDrop } from '@/lib/appwrite/actions/drops'
import EmptyState from '@/components/EmptyState'
import { cn, formatDateTime, isRecentArrival } from '@/lib/utils'

const EXPIRY_OPTIONS: { label: string, value: DropExpiry }[] = [
    { label: '1 day', value: 1 },
    { label: '7 days', value: 7 },
    { label: '30 days', value: 30 },
    { label: 'Never', value: null },
]

const STATUS_LABEL = { open: 'Open', paused: 'Paused', expired: 'Expired', full: 'Full' } as const
// Written out in full so Tailwind keeps the classes
const STATUS_CLASS = { open: 'drops-status-open', paused: 'drops-status-paused', expired: 'drops-status-closed', full: 'drops-status-closed' } as const

const dropUrl = (code: string) => `${window.location.origin}/drop/${code}`

const CreateDropForm = ({ onDone }: { onDone: () => void }) => {
    const [title, setTitle] = useState('')
    const [message, setMessage] = useState('')
    const [expiry, setExpiry] = useState<DropExpiry>(7)
    const [pending, start] = useTransition()
    const titleRef = useRef<HTMLInputElement>(null)
    useEffect(() => titleRef.current?.focus(), [])

    const submit = (e: React.FormEvent) => {
        e.preventDefault()
        start(async () => {
            const result = await createDrop({ title, message, expiresInDays: expiry })
            if (!result.ok) return void toast(result.error, { className: 'error-toast' })
            await navigator.clipboard?.writeText(dropUrl(result.data!.code)).catch(() => undefined)
            toast('Drop link created and copied')
            onDone()
        })
    }

    return (
        <form onSubmit={submit} className='drops-form'>
            <label className='flex flex-col gap-1.5'>
                <span className='subtitle-2 text-light-100'>Title</span>
                <input ref={titleRef} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} required
                    placeholder='e.g. Wedding photos' className='drop-name-input' />
            </label>
            <label className='flex flex-col gap-1.5'>
                <span className='subtitle-2 text-light-100'>Message for senders <span className='text-light-200'>(optional)</span></span>
                <textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={500} rows={2}
                    placeholder='Send me your best shots from Saturday!' className='drop-name-input resize-none py-3' />
            </label>
            <fieldset className='flex flex-col gap-1.5'>
                <legend className='subtitle-2 mb-1.5 text-light-100'>Link expires after</legend>
                <div className='flex flex-wrap gap-2'>
                    {EXPIRY_OPTIONS.map((o) => (
                        <button key={o.label} type='button' aria-pressed={expiry === o.value} onClick={() => setExpiry(o.value)}
                            className={cn('filter-chip body-2 px-3.5 font-medium', expiry === o.value && 'filter-chip-applied')}>
                            {o.label}
                        </button>
                    ))}
                </div>
            </fieldset>
            <p className='caption text-light-200'>Files arrive in a new folder named after the title. Anyone with the link can send files; nobody can see them but you.</p>
            <div className='flex gap-3'>
                <button type='button' className='drop-cancel' onClick={onDone}>Cancel</button>
                <button type='submit' className='primary-btn h-[48px] flex-1 rounded-full text-white disabled:opacity-50' disabled={pending || !title.trim()}>
                    {pending ? 'Creating…' : 'Create link'}
                </button>
            </div>
        </form>
    )
}

const DropCard = ({ drop }: { drop: MyDrop }) => {
    const router = useRouter()
    const [pending, start] = useTransition()
    const [copied, setCopied] = useState(false)
    const [confirm, setConfirm] = useState(false)

    const copy = async () => {
        const ok = await navigator.clipboard?.writeText(dropUrl(drop.code)).then(() => true, () => false)
        if (!ok) return void toast("Couldn't copy. Select the link and copy it instead.", { className: 'error-toast' })
        setCopied(true)
        setTimeout(() => setCopied(false), 1600)
    }
    const toggle = () => start(async () => {
        const result = await setDropEnabled({ dropId: drop.$id, enabled: !drop.enabled })
        if (!result.ok) return void toast(result.error, { className: 'error-toast' })
        toast(drop.enabled ? 'Link paused' : 'Link reopened')
        router.refresh()
    })
    const remove = () => start(async () => {
        const result = await deleteDrop({ dropId: drop.$id })
        if (!result.ok) return void toast(result.error, { className: 'error-toast' })
        toast('Drop link deleted. Received files are still in your folder.')
        router.refresh()
    })

    return (
        <li className={cn('drops-card', pending && 'opacity-60')}>
            <div className='flex items-start justify-between gap-3'>
                <span className='search-folder-icon !size-11 shrink-0'><Inbox className='size-5' aria-hidden /></span>
                <span className={cn('drops-status', STATUS_CLASS[drop.status])}>{STATUS_LABEL[drop.status]}</span>
            </div>
            <div className='min-w-0'>
                <h2 className='flex items-center gap-2'>
                    <span className='subtitle-1 truncate text-light-100'>{drop.title}</span>
                    {isRecentArrival(drop.lastReceivedAt) && <span className='new-badge'>New files</span>}
                </h2>
                <p className='caption text-light-200'>
                    {drop.filesReceived} {drop.filesReceived === 1 ? 'file' : 'files'} received
                    {drop.lastReceivedAt ? ` · last ${formatDateTime(drop.lastReceivedAt)}` : ''}
                </p>
                <p className='caption text-light-200'>
                    {drop.expiresAt ? `${drop.status === 'expired' ? 'Expired' : 'Expires'} ${formatDateTime(drop.expiresAt)}` : 'Never expires'}
                </p>
            </div>
            <div className='drops-link'>
                <code className='truncate'>/drop/{drop.code}</code>
                <button type='button' onClick={copy} aria-label='Copy link' className='drops-icon-btn'>
                    {copied ? <Check className='size-4 text-green' /> : <Copy className='size-4' />}
                </button>
                <a href={`/drop/${drop.code}`} target='_blank' rel='noreferrer' aria-label='Open drop page' className='drops-icon-btn'>
                    <ExternalLink className='size-4' />
                </a>
            </div>
            <div className='flex flex-wrap gap-2'>
                {drop.folderId && (
                    <Link href={`/folders/${drop.folderId}`} className='drops-action'><FolderOpen className='size-4' /> {drop.folderName ?? 'Folder'}</Link>
                )}
                <button type='button' className='drops-action' onClick={toggle} disabled={pending}>
                    {drop.enabled ? <><Pause className='size-4' /> Pause</> : <><Play className='size-4' /> Reopen</>}
                </button>
                <button type='button' className='drops-action drops-action-danger' onClick={() => setConfirm(true)} disabled={pending}>
                    <Trash2 className='size-4' /> Delete
                </button>
            </div>

            <AlertDialog open={confirm} onOpenChange={setConfirm}>
                <AlertDialogContent className='shad-alert-dialog'>
                    <AlertDialogHeader>
                        <AlertDialogTitle className='h3 text-center text-light-100'>Delete this drop link?</AlertDialogTitle>
                        <AlertDialogDescription className='subtitle-2 text-center text-light-100'>
                            The link stops working straight away. Files already received stay in your folder.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className='flex flex-col gap-3 md:flex-row'>
                        <AlertDialogCancel className='modal-cancel-button'>Keep link</AlertDialogCancel>
                        <AlertDialogAction className='modal-submit-button' onClick={remove}>Delete link</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </li>
    )
}

const DropsManager = ({ drops }: { drops: MyDrop[] }) => {
    const router = useRouter()
    const params = useSearchParams()
    const [creating, setCreating] = useState(params.get('new') === '1')

    useEffect(() => {
        if (params.get('new') === '1') {
            setCreating(true)
            window.history.replaceState(null, '', '/drops')
        }
    }, [params])

    return (
        <>
            {creating ? (
                <CreateDropForm onDone={() => { setCreating(false); router.refresh() }} />
            ) : (
                <button type='button' className='drops-new' onClick={() => setCreating(true)}>
                    <Plus className='size-5' /> New drop link
                </button>
            )}
            {drops.length === 0 ? (
                !creating && (
                    <EmptyState icon={Inbox} title='No drop links yet'>
                        Create one to collect files from anyone, even people without a StoreIt account.
                    </EmptyState>
                )
            ) : (
                <ul className='drops-grid stagger'>
                    {drops.map((d) => <DropCard key={d.$id} drop={d} />)}
                </ul>
            )}
        </>
    )
}

export default DropsManager
