'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { completeUpload, discardUpload, prepareUpload, refreshUploadToken } from '@/lib/appwrite/actions/upload.action'
import { analyzeFile } from '@/lib/smart/analyze'
import { getFileType } from '@/lib/utils'
import { MAX_FILE_SIZE } from '../../../constants'
import { DropContents } from './collectDrop'
import { newFileId, uploadInChunks, UploadCanceledError } from './chunkedUpload'

export type UploadStatus =
    | 'preparing'  // waiting for the server to check names, space and create folders
    | 'waiting'    // name clash, waiting for Replace / Keep both
    | 'queued'
    | 'uploading'
    | 'paused'     // offline
    | 'finishing'  // bytes sent, saving the file record
    | 'done'
    | 'failed'
    | 'canceled'

export interface UploadItem {
    id: string,
    file: File,
    // Name the file is saved under (a "Keep both" upload gets "name (1).ext")
    name: string,
    dir: string,
    groupId: string | null,
    folderId: string | null,
    replaceFileId?: string,
    status: UploadStatus,
    error?: string,
    // Retry is offered only when the same upload can be sent again
    retryable: boolean,
    sent: number,
    bucketFileId: string,
    // Some bytes may be stored in the bucket (so a retry resumes, and a cancel cleans up)
    started: boolean,
    previewUrl: string,
}

export interface UploadGroup {
    id: string,
    name: string,
    status: 'preparing' | 'ready' | 'failed',
    error?: string,
}

export interface ClashPrompt {
    id: string,
    folderName: string,
    itemIds: string[],
    clashes: Record<string, { existingFileId: string, freeName: string }>,
}

export type UploadRow =
    | { kind: 'file', item: UploadItem }
    | { kind: 'folder', group: UploadGroup, items: UploadItem[] }

const CONCURRENCY = 3
const ACTIVE: UploadStatus[] = ['preparing', 'waiting', 'queued', 'uploading', 'paused', 'finishing']
const RUNNING: UploadStatus[] = ['uploading', 'paused', 'finishing']
const JWT_LIFETIME_MS = 15 * 60 * 1000

export const isActive = (status: UploadStatus) => ACTIVE.includes(status)

// One status for a dropped folder's row, from the files inside it
export const groupStatus = (group: UploadGroup, items: UploadItem[]): UploadStatus => {
    if (group.status === 'preparing') return 'preparing'
    if (group.status === 'failed') return 'failed'
    if (items.some((i) => i.status === 'paused')) return 'paused'
    if (items.some((i) => isActive(i.status))) return 'uploading'
    if (items.some((i) => i.status === 'failed')) return 'failed'
    if (items.length > 0 && items.every((i) => i.status === 'canceled')) return 'canceled'
    return 'done'
}

export const useUploadQueue = ({ path }: { path: string }) => {
    const items = useRef(new Map<string, UploadItem>())
    const groups = useRef(new Map<string, UploadGroup>())
    // Top-level rows in the order they were added: a file id or a folder group id
    const order = useRef<string[]>([])
    const controllers = useRef(new Map<string, AbortController>())
    const jwt = useRef<{ value: string, expiresAt: number } | null>(null)
    const jwtRequest = useRef<Promise<string> | null>(null)
    const pathRef = useRef(path)
    pathRef.current = path
    // Every byte confirmed sent since the page loaded; the time-left estimate is based on how fast it grows
    const bytesSentTotal = useRef(0)

    const [, setVersion] = useState(0)
    const [prompts, setPromptsState] = useState<ClashPrompt[]>([])
    const promptsRef = useRef<ClashPrompt[]>([])
    const setPrompts = useCallback((next: ClashPrompt[]) => {
        promptsRef.current = next
        setPromptsState(next)
    }, [])
    const [online, setOnline] = useState(true)
    const [etaSeconds, setEtaSeconds] = useState<number | null>(null)

    // Progress events arrive many times a second; repaint at most once per frame
    const frame = useRef<number | null>(null)
    const render = useCallback(() => {
        if (frame.current !== null) return
        frame.current = requestAnimationFrame(() => {
            frame.current = null
            setVersion((v) => v + 1)
        })
    }, [])

    const update = useCallback((id: string, patch: Partial<UploadItem>) => {
        const item = items.current.get(id)
        if (!item) return
        items.current.set(id, { ...item, ...patch })
        render()
    }, [render])

    const setJwt = (value: string) => {
        jwt.current = { value, expiresAt: Date.now() + JWT_LIFETIME_MS }
    }

    const getJwt = useCallback(async (refresh = false) => {
        if (!refresh && jwt.current && jwt.current.expiresAt - Date.now() > 60_000) return jwt.current.value
        jwtRequest.current ??= refreshUploadToken().then((result) => {
            if (!result.ok || !result.data) throw new Error(result.ok ? 'No upload token' : result.error)
            setJwt(result.data)
            return result.data
        }).finally(() => { jwtRequest.current = null })
        return jwtRequest.current
    }, [])

    const discard = useCallback((bucketFileId: string) => {
        // A chunk that was in flight when the upload stopped can still land afterwards, so clean up twice
        discardUpload({ bucketFileId }).catch(() => undefined)
        setTimeout(() => discardUpload({ bucketFileId }).catch(() => undefined), 5000)
    }, [])

    const waitUntilOnline = useCallback((id: string, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
        update(id, { status: 'paused' })
        const onOnline = () => {
            cleanup()
            update(id, { status: 'uploading' })
            resolve()
        }
        const onAbort = () => {
            cleanup()
            reject(new UploadCanceledError())
        }
        const cleanup = () => {
            window.removeEventListener('online', onOnline)
            signal.removeEventListener('abort', onAbort)
        }
        window.addEventListener('online', onOnline)
        signal.addEventListener('abort', onAbort, { once: true })
        if (navigator.onLine) onOnline()
    }), [update])

    const pumpRef = useRef<() => void>(() => undefined)

    const start = useCallback(async (id: string) => {
        const controller = new AbortController()
        controllers.current.set(id, controller)
        const before = items.current.get(id)!
        update(id, { status: navigator.onLine ? 'uploading' : 'paused', error: undefined, started: true })

        // Smart tags are worked out while the bytes upload; analyzeFile never throws
        const smart = analyzeFile(before.file)
        try {
            await uploadInChunks({
                file: before.file,
                name: before.name,
                fileId: before.bucketFileId,
                signal: controller.signal,
                getJwt,
                onProgress: (sent) => {
                    const previous = items.current.get(id)?.sent ?? 0
                    if (sent > previous) bytesSentTotal.current += sent - previous
                    update(id, { sent })
                },
                waitUntilOnline: () => waitUntilOnline(id, controller.signal),
                resume: before.started,
            })
            update(id, { status: 'finishing', sent: before.file.size })

            const item = items.current.get(id)!
            const result = await completeUpload({
                bucketFileId: item.bucketFileId,
                folderId: item.folderId,
                name: item.name,
                replaceFileId: item.replaceFileId,
                path: pathRef.current,
                smart: await smart,
            })
            if (!result.ok) throw new Error(result.error)
            update(id, { status: 'done', started: false })
        } catch (error) {
            const item = items.current.get(id)
            if (error instanceof UploadCanceledError || controller.signal.aborted || item?.status === 'canceled') {
                update(id, { status: 'canceled' })
                if (item?.started) discard(item.bucketFileId)
            } else {
                update(id, { status: 'failed', error: error instanceof Error ? error.message : 'Upload failed' })
            }
        } finally {
            controllers.current.delete(id)
            pumpRef.current()
        }
    }, [discard, getJwt, update, waitUntilOnline])

    const pump = useCallback(() => {
        const all = [...items.current.values()]
        let running = all.filter((i) => RUNNING.includes(i.status)).length
        for (const item of all) {
            if (running >= CONCURRENCY) break
            if (item.status !== 'queued') continue
            running++
            items.current.set(item.id, { ...item, status: 'uploading' })
            void start(item.id)
        }
        render()
    }, [render, start])
    pumpRef.current = pump

    const enqueue = useCallback(async (drop: DropContents, targetFolderId: string | null, targetName: string) => {
        const groupIdOf = new Map<string, string>()
        for (const root of drop.roots) {
            const id = crypto.randomUUID()
            groupIdOf.set(root, id)
            groups.current.set(id, { id, name: root, status: 'preparing' })
            order.current.push(id)
        }

        const added: UploadItem[] = drop.files.map(({ file, dir }) => {
            const tooLarge = file.size > MAX_FILE_SIZE
            const groupId = dir ? groupIdOf.get(dir.split('/')[0]) ?? null : null
            const item: UploadItem = {
                id: crypto.randomUUID(),
                file,
                name: file.name,
                dir,
                groupId,
                folderId: null,
                status: tooLarge ? 'failed' : 'preparing',
                error: tooLarge ? 'Over the 50 MB per-file limit' : undefined,
                retryable: false,
                sent: 0,
                bucketFileId: newFileId(),
                started: false,
                previewUrl: getFileType(file.name).type === 'image' ? URL.createObjectURL(file) : '',
            }
            items.current.set(item.id, item)
            if (!groupId) order.current.push(item.id)
            return item
        })
        render()

        const toSend = added.filter((i) => i.status === 'preparing')
        if (toSend.length === 0 && drop.dirs.length === 0) return

        const failAll = (error: string) => {
            toSend.forEach((i) => update(i.id, { status: 'failed', error }))
            groupIdOf.forEach((id) => groups.current.set(id, { ...groups.current.get(id)!, status: 'failed', error }))
            render()
        }

        let prepared: Awaited<ReturnType<typeof prepareUpload>>
        try {
            prepared = await prepareUpload({
                targetFolderId,
                files: toSend.map((i) => ({ key: i.id, name: i.name, size: i.file.size, dir: i.dir })),
                dirs: drop.dirs,
                path: pathRef.current,
            })
        } catch {
            prepared = { ok: false, error: "Couldn't start the upload" }
        }
        if (!prepared.ok || !prepared.data) return failAll(prepared.ok ? "Couldn't start the upload" : prepared.error)

        const { jwt: token, folderIds, clashes } = prepared.data
        setJwt(token)
        groupIdOf.forEach((id) => groups.current.set(id, { ...groups.current.get(id)!, status: 'ready' }))

        const clashing: string[] = []
        for (const item of toSend) {
            // Canceled while the server was preparing
            if (items.current.get(item.id)?.status !== 'preparing') continue
            const folderId = folderIds[item.dir] ?? null
            if (clashes[item.id]) {
                clashing.push(item.id)
                update(item.id, { folderId, status: 'waiting' })
            } else {
                update(item.id, { folderId, status: 'queued', retryable: true })
            }
        }
        if (clashing.length > 0) {
            setPrompts([...promptsRef.current, { id: crypto.randomUUID(), folderName: targetName, itemIds: clashing, clashes }])
        }
        pump()
    }, [pump, render, setPrompts, update])

    const resolveClash = useCallback((promptId: string, choice: 'replace' | 'keep' | 'skip') => {
        const prompt = promptsRef.current.find((p) => p.id === promptId)
        prompt?.itemIds.forEach((id) => {
            if (items.current.get(id)?.status !== 'waiting') return
            const clash = prompt.clashes[id]
            if (choice === 'skip') update(id, { status: 'canceled', error: 'Skipped' })
            else if (choice === 'keep') update(id, { status: 'queued', name: clash.freeName, retryable: true })
            else update(id, { status: 'queued', replaceFileId: clash.existingFileId, retryable: true })
        })
        setPrompts(promptsRef.current.filter((p) => p.id !== promptId))
        pumpRef.current()
    }, [setPrompts, update])

    const cancelItem = useCallback((id: string) => {
        const item = items.current.get(id)
        if (!item || !isActive(item.status) || item.status === 'finishing') return
        update(id, { status: 'canceled' })
        const controller = controllers.current.get(id)
        if (controller) controller.abort()
        else if (item.started) discard(item.bucketFileId)
    }, [discard, update])

    const cancel = useCallback((rowId: string) => {
        if (groups.current.has(rowId)) {
            items.current.forEach((i) => i.groupId === rowId && cancelItem(i.id))
        } else cancelItem(rowId)
        pumpRef.current()
    }, [cancelItem])

    const cancelAll = useCallback(() => {
        items.current.forEach((i) => cancelItem(i.id))
        setPrompts([])
        pumpRef.current()
    }, [cancelItem, setPrompts])

    const retry = useCallback((rowId: string) => {
        items.current.forEach((i) => {
            if ((i.id === rowId || i.groupId === rowId) && i.status === 'failed' && i.retryable) {
                update(i.id, { status: 'queued', error: undefined })
            }
        })
        pumpRef.current()
    }, [update])

    const forget = useCallback((item: UploadItem) => {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl)
        // Bytes from a failed upload that the user gave up on
        if (item.status === 'failed' && item.started) discard(item.bucketFileId)
        items.current.delete(item.id)
    }, [discard])

    const dismiss = useCallback((rowId: string) => {
        items.current.forEach((i) => (i.id === rowId || i.groupId === rowId) && !isActive(i.status) && forget(i))
        const stillThere = [...items.current.values()].some((i) => i.groupId === rowId)
        if (!stillThere) {
            groups.current.delete(rowId)
            order.current = order.current.filter((id) => id !== rowId)
        }
        render()
    }, [forget, render])

    const clear = useCallback(() => {
        cancelAll()
        items.current.forEach(forget)
        groups.current.clear()
        order.current = []
        render()
    }, [cancelAll, forget, render])

    // Offline: running uploads pause on their own; the header says why.
    // Rows show "Paused" straight away, before the in-flight chunk times out.
    useEffect(() => {
        setOnline(navigator.onLine)
        const setRunning = (from: UploadStatus, to: UploadStatus) =>
            items.current.forEach((item, id) => item.status === from && update(id, { status: to }))
        const onOnline = () => { setOnline(true); setRunning('paused', 'uploading'); pumpRef.current() }
        const onOffline = () => { setOnline(false); setRunning('uploading', 'paused') }
        window.addEventListener('online', onOnline)
        window.addEventListener('offline', onOffline)
        return () => {
            window.removeEventListener('online', onOnline)
            window.removeEventListener('offline', onOffline)
        }
    }, [update])

    // Release preview URLs on unmount
    useEffect(() => () => {
        items.current.forEach((i) => i.previewUrl && URL.revokeObjectURL(i.previewUrl))
        if (frame.current !== null) cancelAnimationFrame(frame.current)
    }, [])

    const all = [...items.current.values()]
    const active = all.filter((i) => isActive(i.status))
    const activeCount = active.length

    // Time left from a smoothed transfer rate; nothing is shown until there are a couple of samples
    const rate = useRef<{ bytes: number, at: number, perSecond: number, samples: number } | null>(null)
    const bytesLeft = useRef(0)
    bytesLeft.current = active.filter((i) => i.status !== 'waiting').reduce((sum, i) => sum + i.file.size - i.sent, 0)
    const running = activeCount > 0

    useEffect(() => {
        if (!running) {
            rate.current = null
            setEtaSeconds(null)
            return
        }
        const timer = setInterval(() => {
            const now = Date.now()
            const bytesSent = bytesSentTotal.current
            const prev = rate.current
            if (!prev) {
                rate.current = { bytes: bytesSent, at: now, perSecond: 0, samples: 0 }
                return
            }
            const instant = ((bytesSent - prev.bytes) / (now - prev.at)) * 1000
            const perSecond = prev.samples === 0 ? instant : prev.perSecond * 0.7 + instant * 0.3
            rate.current = { bytes: bytesSent, at: now, perSecond, samples: prev.samples + 1 }
            setEtaSeconds(rate.current.samples >= 2 && perSecond > 0 ? bytesLeft.current / perSecond : null)
        }, 1000)
        return () => clearInterval(timer)
    }, [running])

    const rows: UploadRow[] = order.current.flatMap((id): UploadRow[] => {
        const group = groups.current.get(id)
        if (group) return [{ kind: 'folder', group, items: all.filter((i) => i.groupId === id) }]
        const item = items.current.get(id)
        return item ? [{ kind: 'file', item }] : []
    })

    const summary = {
        active: activeCount,
        done: all.filter((i) => i.status === 'done').length,
        failed: all.filter((i) => i.status === 'failed').length,
        canceled: all.filter((i) => i.status === 'canceled' && i.error !== 'Skipped').length,
    }

    return {
        rows,
        summary,
        online,
        etaSeconds: online ? etaSeconds : null,
        prompt: prompts[0] ?? null,
        promptNames: (prompts[0]?.itemIds ?? []).map((id) => items.current.get(id)?.name ?? ''),
        enqueue,
        resolveClash,
        cancel,
        cancelAll,
        retry,
        dismiss,
        clear,
    }
}
