// Uploads one file from the browser straight to the Appwrite bucket, in 5 MiB chunks.
// XMLHttpRequest instead of the Appwrite Web SDK: it reports bytes sent while a chunk is in flight and can be aborted.

export const CHUNK_SIZE = 5 * 1024 * 1024
const MAX_ATTEMPTS = 6

const endpoint = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT!
const projectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID!
const bucketId = process.env.NEXT_PUBLIC_APPWRITE_BUCKET!

export class UploadCanceledError extends Error {
    constructor() { super('Upload canceled') }
}

export class UploadFailedError extends Error {}

class HttpError extends Error {
    constructor(public status: number, message: string) { super(message) }
}

export interface ChunkedUploadOptions {
    file: File,
    name: string,
    // Chosen by the browser so an interrupted upload can be resumed under the same id
    fileId: string,
    signal: AbortSignal,
    getJwt: (refresh?: boolean) => Promise<string>,
    onProgress: (sentBytes: number) => void,
    // Called when the upload has to wait for the network; resolves once the browser is back online
    waitUntilOnline: () => Promise<void>,
    // Ask Appwrite how many chunks it already has before sending (used when retrying)
    resume?: boolean,
}

// Appwrite's own ids: up to 36 characters from a-z, A-Z, 0-9
export const newFileId = () => crypto.randomUUID().replace(/-/g, '')

const sleep = (ms: number, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    signal.addEventListener('abort', () => {
        clearTimeout(timer)
        reject(new UploadCanceledError())
    }, { once: true })
})

const sendChunk = (opts: ChunkedUploadOptions, jwt: string, start: number, end: number) =>
    new Promise<void>((resolve, reject) => {
        const { file, name, fileId, signal } = opts
        const xhr = new XMLHttpRequest()
        xhr.open('POST', `${endpoint}/storage/buckets/${bucketId}/files`)
        xhr.setRequestHeader('X-Appwrite-Project', projectId)
        xhr.setRequestHeader('X-Appwrite-JWT', jwt)
        // Small files go in one request; Appwrite treats a Content-Range header as a chunked upload
        if (file.size > CHUNK_SIZE) {
            xhr.setRequestHeader('Content-Range', `bytes ${start}-${end - 1}/${file.size}`)
            if (start > 0) xhr.setRequestHeader('X-Appwrite-ID', fileId)
        }

        const body = new FormData()
        body.append('fileId', fileId)
        body.append('file', file.slice(start, end), name)

        const onAbort = () => xhr.abort()
        signal.addEventListener('abort', onAbort, { once: true })
        const done = () => signal.removeEventListener('abort', onAbort)

        xhr.upload.onprogress = (e) => opts.onProgress(start + Math.min(e.loaded, end - start))
        xhr.onload = () => {
            done()
            if (xhr.status >= 200 && xhr.status < 300) return resolve()
            let message = `HTTP ${xhr.status}`
            try { message = JSON.parse(xhr.responseText).message ?? message } catch { /* not JSON */ }
            reject(new HttpError(xhr.status, message))
        }
        xhr.onerror = () => { done(); reject(new HttpError(0, 'Network error')) }
        xhr.onabort = () => { done(); reject(new UploadCanceledError()) }
        xhr.send(body)
    })

// How many chunks Appwrite already has for this file id (0 if it has none)
const uploadedChunks = async (opts: ChunkedUploadOptions, jwt: string) => {
    const res = await fetch(`${endpoint}/storage/buckets/${bucketId}/files/${opts.fileId}`, {
        headers: { 'X-Appwrite-Project': projectId, 'X-Appwrite-JWT': jwt },
        signal: opts.signal,
    })
    if (res.status === 404) return 0
    if (!res.ok) throw new HttpError(res.status, `HTTP ${res.status}`)
    const stored = await res.json() as { chunksUploaded: number, chunksTotal: number }
    return stored.chunksUploaded
}

const isRetryable = (error: unknown) =>
    error instanceof HttpError && (error.status === 0 || error.status === 408 || error.status === 429 || error.status >= 500)

export const uploadInChunks = async (opts: ChunkedUploadOptions) => {
    const { file, signal } = opts
    if (file.size === 0) throw new UploadFailedError("Empty files can't be uploaded")

    const totalChunks = Math.max(1, Math.ceil(file.size / CHUNK_SIZE))
    let jwt = await opts.getJwt()
    let next = 0
    let attempts = 0
    let refreshedJwt = false
    let checkServer = Boolean(opts.resume)

    while (next < totalChunks) {
        if (signal.aborted) throw new UploadCanceledError()
        try {
            if (checkServer) {
                // After a failure, continue from the last chunk Appwrite confirmed instead of starting over
                next = await uploadedChunks(opts, jwt)
                checkServer = false
                opts.onProgress(Math.min(next * CHUNK_SIZE, file.size))
                if (next >= totalChunks) break
            }
            const start = next * CHUNK_SIZE
            await sendChunk(opts, jwt, start, Math.min(start + CHUNK_SIZE, file.size))
            next++
            attempts = 0
            refreshedJwt = false
        } catch (error) {
            if (error instanceof UploadCanceledError || signal.aborted) throw new UploadCanceledError()
            if (error instanceof DOMException && error.name === 'AbortError') throw new UploadCanceledError()

            if (error instanceof HttpError && error.status === 401 && !refreshedJwt) {
                jwt = await opts.getJwt(true)
                refreshedJwt = true
                continue
            }
            // A chunk whose response was lost may already be stored, which Appwrite reports as a conflict
            if (error instanceof HttpError && error.status === 409 && ++attempts < MAX_ATTEMPTS) {
                checkServer = true
                continue
            }
            if (!navigator.onLine) {
                await opts.waitUntilOnline()
                checkServer = true
                continue
            }
            if (!isRetryable(error) || ++attempts >= MAX_ATTEMPTS) {
                throw new UploadFailedError(error instanceof Error ? error.message : 'Upload failed')
            }
            await sleep(Math.min(30_000, 1000 * 2 ** (attempts - 1)), signal)
            checkServer = true
        }
    }
    opts.onProgress(file.size)
}
