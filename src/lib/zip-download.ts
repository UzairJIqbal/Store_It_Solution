'use client'
// Builds a ZIP of several files or whole folders in the browser and saves it, with progress in one toast.
import { zip, Zippable } from 'fflate'
import { toast } from 'sonner'
import { errorToast } from '@/lib/undo'
import { fileDownloadUrl } from '@/lib/utils'
import { getDownloadTree } from '@/lib/appwrite/actions/download.action'

// The whole archive is held in memory before it's saved
const MAX_ZIP_BYTES = 500 * 1024 * 1024

// "a.txt" twice → "a.txt", "a (1).txt"
const uniquePath = (path: string, taken: Set<string>) => {
    if (!taken.has(path)) return path
    const slash = path.lastIndexOf('/')
    const dot = path.lastIndexOf('.')
    const [base, ext] = dot > slash + 1 ? [path.slice(0, dot), path.slice(dot)] : [path, '']
    for (let n = 1; ; n++) {
        const candidate = `${base} (${n})${ext}`
        if (!taken.has(candidate)) return candidate
    }
}

const save = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = name
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export const downloadZip = async ({ folderIds, fileIds, name }: { folderIds: string[], fileIds: string[], name: string }) => {
    const id = toast.loading('Preparing download…')
    try {
        const tree = await getDownloadTree({ folderIds, fileIds })
        if (!tree.ok) throw new Error(tree.error)
        const entries = tree.data ?? []
        if (entries.length === 0) {
            toast.dismiss(id)
            return errorToast('There are no files to download')
        }
        const total = entries.reduce((sum, e) => sum + e.size, 0)
        if (total > MAX_ZIP_BYTES) {
            toast.dismiss(id)
            return errorToast('That download is over 500 MB. Download fewer items at a time.')
        }

        const files: Zippable = {}
        const taken = new Set<string>()
        for (const [index, entry] of entries.entries()) {
            toast.loading(`Zipping ${index + 1} of ${entries.length}…`, { id })
            const response = await fetch(fileDownloadUrl(entry.id))
            if (!response.ok) throw new Error(`Couldn't download "${entry.path}"`)
            const path = uniquePath(entry.path, taken)
            taken.add(path)
            files[path] = new Uint8Array(await response.arrayBuffer())
        }

        // Stored, not compressed: most uploads (images, video, PDFs) are compressed already
        const archive = await new Promise<Uint8Array>((resolve, reject) =>
            zip(files, { level: 0 }, (error, data) => (error ? reject(error) : resolve(data))))
        save(new Blob([archive as BlobPart], { type: 'application/zip' }), `${name}.zip`)
        toast.success(`Downloaded ${name}.zip`, { id })
    } catch (error) {
        toast.dismiss(id)
        errorToast(error instanceof Error ? error.message : "Couldn't prepare the download")
    }
}
