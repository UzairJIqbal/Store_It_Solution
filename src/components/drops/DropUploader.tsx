'use client'

import { useRef, useState } from 'react'
import { CheckCircle2, CircleAlert, FileUp, Loader2, X } from 'lucide-react'
import { completeDropUpload, discardDropUpload, prepareDropUpload, refreshDropToken } from '@/lib/appwrite/actions/drop.action'
import { newFileId, uploadInChunks, UploadCanceledError } from '@/lib/upload/chunkedUpload'
import { analyzeFile } from '@/lib/smart/analyze'
import { convertFileSize } from '@/lib/utils'
import { MAX_FILE_SIZE } from '../../../constants'

type Status = 'waiting' | 'uploading' | 'done' | 'failed'
interface Item { key: string, file: File, sent: number, status: Status, error?: string }

const MAX_BATCH = 20

// The public upload form on /drop/[code]. Visitors pick files, add their name, and send.
const DropUploader = ({ code, filesLeft }: { code: string, filesLeft: number }) => {
    const [items, setItems] = useState<Item[]>([])
    const [name, setName] = useState('')
    const [sending, setSending] = useState(false)
    const [error, setError] = useState('')
    const [dragging, setDragging] = useState(false)
    const input = useRef<HTMLInputElement>(null)
    const abort = useRef<AbortController | null>(null)

    const update = (key: string, patch: Partial<Item>) =>
        setItems((list) => list.map((i) => i.key === key ? { ...i, ...patch } : i))

    const add = (files: FileList | null) => {
        if (!files || sending) return
        setError('')
        const picked = [...files].filter((f) => f.size > 0)
        const tooBig = picked.filter((f) => f.size > MAX_FILE_SIZE)
        if (tooBig.length) setError(`${tooBig.length === 1 ? tooBig[0].name : `${tooBig.length} files`} — files must be 50 MB or smaller`)
        setItems((list) => [
            ...list.filter((i) => i.status !== 'done'),
            ...picked.filter((f) => f.size <= MAX_FILE_SIZE).map((file) => ({ key: newFileId(), file, sent: 0, status: 'waiting' as const })),
        ].slice(0, Math.min(MAX_BATCH, filesLeft)))
    }

    const send = async () => {
        const queue = items.filter((i) => i.status === 'waiting' || i.status === 'failed')
        if (!queue.length) return
        setSending(true)
        setError('')
        const prepared = await prepareDropUpload({ code, files: queue.map((i) => ({ name: i.file.name, size: i.file.size })) })
        if (!prepared.ok) {
            setSending(false)
            return setError(prepared.error)
        }
        let jwt = prepared.data!
        abort.current = new AbortController()
        const signal = abort.current.signal

        for (const item of queue) {
            if (signal.aborted) break
            const bucketFileId = newFileId()
            update(item.key, { status: 'uploading', sent: 0, error: undefined })
            const smart = analyzeFile(item.file)
            try {
                await uploadInChunks({
                    file: item.file,
                    name: item.file.name,
                    fileId: bucketFileId,
                    signal,
                    getJwt: async (refresh) => {
                        if (!refresh) return jwt
                        const next = await refreshDropToken({ code })
                        if (!next.ok) throw new Error(next.error)
                        jwt = next.data!
                        return jwt
                    },
                    onProgress: (sent) => update(item.key, { sent }),
                    waitUntilOnline: () => new Promise((resolve) => window.addEventListener('online', () => resolve(), { once: true })),
                })
                const done = await completeDropUpload({ code, bucketFileId, name: item.file.name, uploaderName: name, smart: await smart })
                if (!done.ok) throw new Error(done.error)
                update(item.key, { status: 'done', sent: item.file.size })
            } catch (e) {
                await discardDropUpload({ code, bucketFileId }).catch(() => undefined)
                const canceled = e instanceof UploadCanceledError
                update(item.key, { status: canceled ? 'waiting' : 'failed', sent: 0, error: canceled ? undefined : (e as Error).message || 'Upload failed' })
            }
        }
        abort.current = null
        setSending(false)
    }

    const doneCount = items.filter((i) => i.status === 'done').length
    const pending = items.filter((i) => i.status !== 'done').length

    return (
        <div className='drop-uploader'>
            <button
                type='button'
                className={`drop-zone ${dragging ? 'drop-zone-active' : ''}`}
                onClick={() => input.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => { e.preventDefault(); setDragging(false); add(e.dataTransfer.files) }}
                disabled={sending}
            >
                <span className='drop-zone-icon'><FileUp className='size-7' /></span>
                <span className='h4 text-light-100'>Drop files here or <span className='text-brand'>browse</span></span>
                <span className='caption text-light-200'>Up to {Math.min(MAX_BATCH, filesLeft)} files · 50 MB each</span>
            </button>
            <input ref={input} type='file' multiple hidden onChange={(e) => { add(e.target.files); e.target.value = '' }} />

            {items.length > 0 && (
                <ul className='drop-list'>
                    {items.map((item) => (
                        <li key={item.key} className='drop-item'>
                            <span className='drop-item-status'>
                                {item.status === 'done' ? <CheckCircle2 className='size-5 text-green' />
                                    : item.status === 'failed' ? <CircleAlert className='size-5 text-red' />
                                        : item.status === 'uploading' ? <Loader2 className='size-5 animate-spin text-brand' />
                                            : <FileUp className='size-5 text-light-200' />}
                            </span>
                            <span className='min-w-0 flex-1'>
                                <span className='subtitle-2 block truncate text-light-100'>{item.file.name}</span>
                                <span className={`caption block ${item.error ? 'text-error' : 'text-light-200'}`}>
                                    {item.error ?? (item.status === 'uploading'
                                        ? `${convertFileSize(item.sent)} of ${convertFileSize(item.file.size)}`
                                        : item.status === 'done' ? 'Sent' : convertFileSize(item.file.size))}
                                </span>
                                {item.status === 'uploading' && (
                                    <span className='drop-progress'><span style={{ width: `${(item.sent / item.file.size) * 100}%` }} /></span>
                                )}
                            </span>
                            {!sending && item.status !== 'done' && (
                                <button type='button' aria-label={`Remove ${item.file.name}`} className='drop-item-remove'
                                    onClick={() => setItems((list) => list.filter((i) => i.key !== item.key))}>
                                    <X className='size-4' />
                                </button>
                            )}
                        </li>
                    ))}
                </ul>
            )}

            <label className='flex flex-col gap-1.5'>
                <span className='subtitle-2 text-light-100'>Your name <span className='text-light-200'>(optional)</span></span>
                <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder='So they know who sent it'
                    className='drop-name-input' disabled={sending} />
            </label>

            {error && <p role='alert' className='body-2 text-error'>{error}</p>}
            {doneCount > 0 && !sending && pending === 0 && (
                <p role='status' className='drop-success'><CheckCircle2 className='size-5' /> {doneCount} file{doneCount === 1 ? '' : 's'} sent. You can close this page.</p>
            )}

            <div className='flex gap-3'>
                <button type='button' className='primary-btn h-[52px] flex-1 rounded-full text-white disabled:opacity-50' disabled={sending || pending === 0} onClick={send}>
                    {sending ? 'Sending…' : `Send ${pending || ''} file${pending === 1 ? '' : 's'}`.replace('  ', ' ')}
                </button>
                {sending && (
                    <button type='button' className='drop-cancel' onClick={() => abort.current?.abort()}>Cancel</button>
                )}
            </div>
        </div>
    )
}

export default DropUploader
