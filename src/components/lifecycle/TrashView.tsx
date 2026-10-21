'use client'
import React, { useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { errorToast, undoToast } from '@/lib/undo'
import { FolderClosed, Loader2, RotateCcw, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import Thumbnail from '@/components/Thumbnail'
import { convertFileSize, formatDateTime, groupByRecency } from '@/lib/utils'
import { deleteForever, emptyTrash, restoreItems, TrashItem, trashItems } from '@/lib/appwrite/actions/lifecycle.action'

type Confirm = { type: 'empty' } | { type: 'item', item: TrashItem } | null

const idsOf = (item: TrashItem) => (item.kind === 'file' ? { fileIds: [item.id] } : { folderIds: [item.id] })

const daysLeft = (deleteAfter: string) => Math.max(0, Math.ceil((new Date(deleteAfter).getTime() - Date.now()) / 86_400_000))

// The trash: restore puts an item back where it was; delete forever and empty trash ask first
const TrashView = ({ items, days }: { items: TrashItem[], days: number }) => {
    const router = useRouter()
    const path = usePathname()
    const [confirm, setConfirm] = useState<Confirm>(null)
    const [busy, setBusy] = useState<string | null>(null)
    const groups = groupByRecency(items, (item) => item.trashedAt)

    const restore = async (item: TrashItem) => {
        setBusy(item.id)
        const result = await restoreItems({ ...idsOf(item), path })
        setBusy(null)
        if (!result.ok) return errorToast(result.error)
        const message = result.data?.movedToRoot
            ? `"${item.name}" restored to My files because its folder is gone`
            : `"${item.name}" restored`
        undoToast(message, async () => {
            const undo = await trashItems({ ...idsOf(item), path })
            if (!undo.ok) errorToast(undo.error)
            router.refresh()
        })
        router.refresh()
    }

    const runConfirmed = async () => {
        if (!confirm) return
        setBusy('confirm')
        const result = confirm.type === 'empty'
            ? await emptyTrash({ path })
            : await deleteForever({ ...idsOf(confirm.item), path })
        setBusy(null)
        if (!result.ok) return errorToast(result.error)
        toast(confirm.type === 'empty' ? 'Trash emptied' : `"${confirm.item.name}" deleted forever`)
        setConfirm(null)
        router.refresh()
    }

    return (
        <div className='page-container'>
            <section className='flex w-full flex-wrap items-end justify-between gap-4'>
                <div>
                    <h1 className='h1'>Trash</h1>
                    <p className='body-1 mt-2 text-light-200'>Items you moved to the trash, newest first.</p>
                </div>
                {items.length > 0 && (
                    <button type='button' className='toolbar-button' onClick={() => setConfirm({ type: 'empty' })}>
                        <Trash2 className='size-4' aria-hidden />Empty trash
                    </button>
                )}
            </section>

            <p className='trash-banner' role='note'>
                Items in trash will be deleted forever after {days} days
            </p>

            {items.length === 0 ? (
                <div className='flex flex-col items-center gap-3 py-10 text-center'>
                    <span className='flex-center size-16 rounded-full bg-brand/10 text-brand'><Trash2 className='size-8' aria-hidden /></span>
                    <p className='h4 text-light-100'>Nothing in trash</p>
                    <p className='body-2 text-light-200'>Move items you don&apos;t need to the trash. They&apos;re deleted forever after {days} days.</p>
                </div>
            ) : (
                <div className='w-full'>
                    <div className='lifecycle-list-header md:grid-cols-[minmax(0,1fr)_180px_170px_120px_88px]'>
                        <p className='subtitle-2'>Name</p>
                        <p className='subtitle-2'>Original location</p>
                        <p className='subtitle-2'>Date trashed</p>
                        <p className='subtitle-2'>Deleted in</p>
                        <span />
                    </div>
                    {groups.map(([group, rows]) => (
                        <section key={group} className='mt-4'>
                            <h2 className='subtitle-2 px-4 pb-2 text-light-200'>{group}</h2>
                            <ul className='lifecycle-list'>
                                {rows.map((item) => {
                                    const left = daysLeft(item.deleteAfter)
                                    return (
                                        <li key={item.id} className='lifecycle-row grid-cols-[minmax(0,1fr)_88px] md:grid-cols-[minmax(0,1fr)_180px_170px_120px_88px]' data-testid='trash-item'>
                                            <div className='flex min-w-0 items-center gap-3'>
                                                {item.file ? (
                                                    <Thumbnail type={item.file.type} extension={item.file.extension} url={item.file.url} className='!size-10 shrink-0' imageClassName='!size-7' />
                                                ) : (
                                                    <span className='flex-center size-10 shrink-0 rounded-full bg-brand/10 text-brand'><FolderClosed className='size-5' aria-hidden /></span>
                                                )}
                                                <div className='min-w-0'>
                                                    <p className='subtitle-2 truncate text-light-100'>{item.name}</p>
                                                    <p className='caption truncate text-light-200'>
                                                        {item.file ? convertFileSize(item.file.size) : `Folder · ${item.itemCount ?? 0} item${item.itemCount === 1 ? '' : 's'}`}
                                                        <span className='md:hidden'> · {item.location}</span>
                                                    </p>
                                                </div>
                                            </div>
                                            <p className='body-2 hidden truncate text-light-100 md:block'>{item.location}</p>
                                            <p className='body-2 hidden text-light-200 md:block'>{formatDateTime(item.trashedAt)}</p>
                                            <p className='body-2 hidden text-light-200 md:block' title={formatDateTime(item.deleteAfter)}>
                                                {left === 0 ? 'Today' : `${left} day${left === 1 ? '' : 's'}`}
                                            </p>
                                            <div className='flex items-center justify-end gap-1'>
                                                <button type='button' className='toolbar-icon-btn' onClick={() => restore(item)} disabled={busy !== null}
                                                    aria-label={`Restore ${item.name}`} title='Restore'>
                                                    {busy === item.id ? <Loader2 className='size-5 animate-spin' aria-hidden /> : <RotateCcw className='size-5' aria-hidden />}
                                                </button>
                                                <button type='button' className='toolbar-icon-btn !text-error' onClick={() => setConfirm({ type: 'item', item })} disabled={busy !== null}
                                                    aria-label={`Delete ${item.name} forever`} title='Delete forever'>
                                                    <Trash2 className='size-5' aria-hidden />
                                                </button>
                                            </div>
                                        </li>
                                    )
                                })}
                            </ul>
                        </section>
                    ))}
                </div>
            )}

            <Dialog open={confirm !== null} onOpenChange={(open) => !open && busy === null && setConfirm(null)}>
                <DialogContent className='shad-dialog button max-w-[420px]'>
                    <DialogHeader className='flex flex-col gap-3'>
                        <DialogTitle className='text-center text-light-100'>Delete forever?</DialogTitle>
                        <DialogDescription className='text-center'>
                            {confirm?.type === 'empty'
                                ? "All items in trash will be deleted forever. This can't be undone."
                                : `"${confirm?.type === 'item' ? confirm.item.name : ''}" will be deleted forever. This can't be undone.`}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className='flex flex-col gap-3 md:flex-row'>
                        <Button onClick={() => setConfirm(null)} className='modal-cancel-button' disabled={busy !== null}>Cancel</Button>
                        <Button onClick={runConfirmed} className='modal-submit-button !bg-error' disabled={busy !== null}>
                            {busy === 'confirm' ? <Loader2 className='size-5 animate-spin' aria-hidden /> : 'Delete forever'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}

export default TrashView
