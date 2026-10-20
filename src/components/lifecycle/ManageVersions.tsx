'use client'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Download, Loader2, Trash2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { fileDocument } from '../../../types'
import { Button } from '@/components/ui/button'
import { DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { convertFileSize, fileDownloadUrl, formatDateTime } from '@/lib/utils'
import { deleteVersion, listVersions, VersionEntry } from '@/lib/appwrite/actions/lifecycle.action'
import { completeUpload, discardUpload, prepareVersionUpload, refreshUploadToken } from '@/lib/appwrite/actions/upload.action'
import { analyzeFile } from '@/lib/smart/analyze'
import { newFileId, UploadCanceledError, uploadInChunks } from '@/lib/upload/chunkedUpload'

const versionDownloadUrl = (fileId: string, version: VersionEntry) =>
    version.id ? `/api/files/${fileId}?version=${encodeURIComponent(version.id)}&download=1` : fileDownloadUrl(fileId)

// "Manage versions": upload a new version and list, download or delete the older ones
const ManageVersions = ({ file, onClose }: { file: fileDocument, onClose: () => void }) => {
    const path = usePathname()
    const router = useRouter()
    const [data, setData] = useState<{ canEdit: boolean, versions: VersionEntry[] } | null>(null)
    const [progress, setProgress] = useState<{ name: string, sent: number, total: number } | null>(null)
    const [deleting, setDeleting] = useState<string | null>(null)
    // Deleting a version is permanent, so the first press asks and the second deletes
    const [confirming, setConfirming] = useState<string | null>(null)
    const input = useRef<HTMLInputElement>(null)
    const controller = useRef<AbortController | null>(null)

    const load = useCallback(async () => {
        const result = await listVersions({ fileId: file.$id })
        if (result.ok) setData(result.data!)
        else {
            toast(result.error, { className: 'error-toast' })
            onClose()
        }
    }, [file.$id, onClose])

    useEffect(() => { load() }, [load])
    useEffect(() => () => controller.current?.abort(), [])

    const upload = async (picked: File) => {
        const prepared = await prepareVersionUpload({ fileId: file.$id, size: picked.size })
        if (!prepared.ok) return toast(prepared.error, { className: 'error-toast' })

        let jwt = prepared.data!
        const bucketFileId = newFileId()
        const abort = new AbortController()
        controller.current = abort
        setProgress({ name: picked.name, sent: 0, total: picked.size })
        try {
            await uploadInChunks({
                file: picked,
                name: picked.name,
                fileId: bucketFileId,
                signal: abort.signal,
                getJwt: async (refresh) => {
                    if (!refresh) return jwt
                    const next = await refreshUploadToken()
                    if (!next.ok) throw new Error(next.error)
                    jwt = next.data!
                    return jwt
                },
                onProgress: (sent) => setProgress((p) => p && { ...p, sent }),
                waitUntilOnline: () => new Promise((resolve) => window.addEventListener('online', () => resolve(), { once: true })),
            })
            const done = await completeUpload({
                bucketFileId, folderId: file.folderId ?? null, name: picked.name, replaceFileId: file.$id, path, smart: await analyzeFile(picked),
            })
            if (!done.ok) {
                await discardUpload({ bucketFileId })
                return toast(done.error, { className: 'error-toast' })
            }
            toast(`Uploaded a new version of "${file.name}"`)
            router.refresh()
            await load()
        } catch (error) {
            await discardUpload({ bucketFileId }).catch(() => { })
            if (!(error instanceof UploadCanceledError)) toast("Couldn't upload the new version", { className: 'error-toast' })
        } finally {
            controller.current = null
            setProgress(null)
        }
    }

    const remove = async (version: VersionEntry) => {
        setDeleting(version.id)
        const result = await deleteVersion({ fileId: file.$id, versionId: version.id!, path })
        setDeleting(null)
        setConfirming(null)
        if (!result.ok) return toast(result.error, { className: 'error-toast' })
        toast(`Deleted version ${version.number}`)
        router.refresh()
        await load()
    }

    return (
        <div className='flex flex-col gap-5'>
            <DialogHeader>
                <DialogTitle className='text-center text-light-100'>Manage versions</DialogTitle>
                <DialogDescription className='text-center'>
                    Older versions of &ldquo;{file.name}&rdquo; are kept for 30 days, up to 10 of them, then deleted.
                </DialogDescription>
            </DialogHeader>

            {data?.canEdit && (
                <div className='flex flex-col gap-2'>
                    <input
                        ref={input}
                        type='file'
                        className='hidden'
                        aria-hidden
                        tabIndex={-1}
                        onChange={(e) => {
                            const picked = e.target.files?.[0]
                            e.target.value = ''
                            if (picked) upload(picked)
                        }}
                    />
                    {progress ? (
                        <div className='versions-progress' role='status'>
                            <div className='flex items-center justify-between gap-3'>
                                <p className='body-2 truncate text-light-100'>Uploading {progress.name}</p>
                                <button type='button' className='caption text-brand' onClick={() => controller.current?.abort()}>Cancel</button>
                            </div>
                            <div className='versions-progress-bar' aria-hidden>
                                <span style={{ width: `${Math.round((progress.sent / progress.total) * 100)}%` }} />
                            </div>
                            <p className='caption text-light-200'>{convertFileSize(progress.sent)} of {convertFileSize(progress.total)}</p>
                        </div>
                    ) : (
                        <Button type='button' className='modal-submit-button !w-full' onClick={() => input.current?.click()}>
                            <Upload className='size-5' aria-hidden />Upload new version
                        </Button>
                    )}
                </div>
            )}

            {!data ? (
                <div className='flex-center py-6'><Loader2 className='size-5 animate-spin text-brand' aria-label='Loading versions' /></div>
            ) : (
                <ol className='versions-list' aria-label='Versions'>
                    {data.versions.map((version) => (
                        <li key={version.id ?? 'current'} className='versions-item'>
                            <div className='min-w-0 flex-1'>
                                <p className='subtitle-2 flex items-center gap-2 text-light-100'>
                                    Version {version.number}
                                    {version.isCurrent && <span className='versions-badge'>Current</span>}
                                </p>
                                <p className='caption truncate text-light-200'>{version.name}</p>
                                <p className='caption text-light-200'>
                                    {formatDateTime(version.uploadedAt)} · {version.uploadedBy} · {convertFileSize(version.size)}
                                </p>
                            </div>
                            <a
                                href={versionDownloadUrl(file.$id, version)}
                                download={version.name}
                                className='toolbar-icon-btn'
                                aria-label={`Download version ${version.number}`}
                                title='Download'
                            >
                                <Download className='size-5' aria-hidden />
                            </a>
                            {data.canEdit && !version.isCurrent && confirming === version.id && (
                                <button
                                    type='button'
                                    className='versions-confirm'
                                    disabled={deleting !== null}
                                    onClick={() => remove(version)}
                                    onBlur={() => setConfirming(null)}
                                    autoFocus
                                >
                                    {deleting === version.id ? <Loader2 className='size-4 animate-spin' aria-hidden /> : 'Delete forever'}
                                </button>
                            )}
                            {data.canEdit && !version.isCurrent && confirming !== version.id && (
                                <button
                                    type='button'
                                    className='toolbar-icon-btn'
                                    aria-label={`Delete version ${version.number}`}
                                    title='Delete'
                                    disabled={deleting !== null}
                                    onClick={() => setConfirming(version.id)}
                                >
                                    <Trash2 className='size-5' aria-hidden />
                                </button>
                            )}
                        </li>
                    ))}
                </ol>
            )}
        </div>
    )
}

export default ManageVersions
