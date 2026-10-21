'use client'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { Button } from './ui/button'
import { cn } from '@/lib/utils'
import { Upload as UploadIcon } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { toast } from 'sonner'
import { isIgnoredFile, readDrop } from '@/lib/upload/collectDrop'
import { useUploadQueue } from '@/lib/upload/useUploadQueue'
import UploadTray from './upload/UploadTray'
import ClashDialog from './upload/ClashDialog'

interface Props {
    accountId: string,
    ownerId: string,
    className?: string,
    // Accept files and folders dropped anywhere in the window. Enable on one mounted instance only.
    globalDrop?: boolean
}

interface DropTarget {
    folderId: string | null,
    name: string,
    // A folder row under the pointer, highlighted while dragging over it
    element: HTMLElement | null,
}

const ROOT_NAME = 'My Files'

const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files')

// Other components (the New menu, the U shortcut) open the file picker by dispatching this event
export const OPEN_UPLOAD_PICKER_EVENT = 'storeit:open-upload-picker'

// Uploads made while viewing /folders/<id> go into that folder
const folderIdFromPath = (path: string) => path.match(/^\/folders\/([^/]+)/)?.[1] ?? null

// The file browser marks folder rows and its own content area with data-upload-folder-id / -name
const targetAt = (node: EventTarget | null, path: string): DropTarget => {
    const row = node instanceof Element ? node.closest<HTMLElement>('[data-upload-folder-row]') : null
    if (row) return { folderId: row.dataset.uploadFolderId || null, name: row.dataset.uploadFolderName ?? ROOT_NAME, element: row }
    const current = document.querySelector<HTMLElement>('[data-upload-current-folder]')
    if (current) return { folderId: current.dataset.uploadFolderId || null, name: current.dataset.uploadFolderName ?? ROOT_NAME, element: null }
    return { folderId: folderIdFromPath(path), name: ROOT_NAME, element: null }
}

const FileUploader = ({ className, globalDrop = false }: Props) => {
    const path = usePathname()
    const queue = useUploadQueue({ path })
    const [dropTarget, setDropTarget] = useState<DropTarget | null>(null)
    const highlighted = useRef<HTMLElement | null>(null)

    const highlight = (element: HTMLElement | null) => {
        if (highlighted.current === element) return
        highlighted.current?.classList.remove('drop-target-active')
        element?.classList.add('drop-target-active')
        highlighted.current = element
    }

    const { enqueue } = queue
    const upload = useCallback((contents: Awaited<ReturnType<typeof readDrop>>, target: DropTarget) => {
        if (contents.files.length === 0 && contents.dirs.length === 0) return
        void enqueue(contents, target.folderId, target.name)
    }, [enqueue])

    const pickFiles = useCallback((files: File[]) => {
        const kept = files.filter((f) => !isIgnoredFile(f.name))
        upload({ files: kept.map((file) => ({ file, dir: '' })), dirs: [], roots: [] }, targetAt(null, path))
    }, [path, upload])

    // Window-level drop target, so files and folders can be dropped anywhere on the page
    useEffect(() => {
        if (!globalDrop) return
        let depth = 0

        const reset = () => {
            depth = 0
            highlight(null)
            setDropTarget(null)
        }
        const onDragEnter = (e: DragEvent) => {
            if (!hasFiles(e)) return
            e.preventDefault()
            depth++
        }
        const onDragOver = (e: DragEvent) => {
            if (!hasFiles(e)) return
            e.preventDefault()
            if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
            const target = targetAt(e.target, path)
            highlight(target.element)
            setDropTarget((prev) => (prev?.folderId === target.folderId && prev?.name === target.name ? prev : target))
        }
        const onDragLeave = (e: DragEvent) => {
            if (!hasFiles(e)) return
            depth = Math.max(0, depth - 1)
            if (depth === 0) reset()
        }
        const onDrop = (e: DragEvent) => {
            if (!hasFiles(e) || !e.dataTransfer) return
            e.preventDefault()
            const target = targetAt(e.target, path)
            reset()
            readDrop(e.dataTransfer)
                .then((contents) => upload(contents, target))
                .catch(() => toast("Couldn't read the dropped items", { className: 'error-toast' }))
        }

        window.addEventListener('dragenter', onDragEnter)
        window.addEventListener('dragover', onDragOver)
        window.addEventListener('dragleave', onDragLeave)
        window.addEventListener('drop', onDrop)
        return () => {
            window.removeEventListener('dragenter', onDragEnter)
            window.removeEventListener('dragover', onDragOver)
            window.removeEventListener('dragleave', onDragLeave)
            window.removeEventListener('drop', onDrop)
        }
    }, [globalDrop, path, upload])

    // With globalDrop the window handles drops, so the button only opens the file picker
    const { getRootProps, getInputProps, open } = useDropzone({ onDrop: pickFiles, noDrag: globalDrop })

    useEffect(() => {
        if (!globalDrop) return
        window.addEventListener(OPEN_UPLOAD_PICKER_EVENT, open)
        return () => window.removeEventListener(OPEN_UPLOAD_PICKER_EVENT, open)
    }, [globalDrop, open])

    // Leaving the page would stop the uploads
    const uploading = queue.summary.active > 0
    useEffect(() => {
        if (!uploading) return
        const warn = (e: BeforeUnloadEvent) => e.preventDefault()
        window.addEventListener('beforeunload', warn)
        return () => window.removeEventListener('beforeunload', warn)
    }, [uploading])

    return (
        <>
            <div {...getRootProps()} className="cursor-pointer">
                <input {...getInputProps()} />
                <Button
                    type='button'
                    className={cn('uploader-button', className)}
                >
                    <UploadIcon className='size-5' aria-hidden />
                    <span>Upload</span>
                </Button>
            </div>

            {dropTarget && (
                <div className='uploader-drop-overlay' aria-hidden>
                    <div className='uploader-drop-message'>
                        <UploadIcon className="size-5" aria-hidden />
                        <p>Drop to upload to <span className='font-semibold'>{dropTarget.name}</span></p>
                    </div>
                </div>
            )}

            {queue.rows.length > 0 && (
                <UploadTray
                    rows={queue.rows}
                    summary={queue.summary}
                    online={queue.online}
                    etaSeconds={queue.etaSeconds}
                    onCancel={queue.cancel}
                    onCancelAll={queue.cancelAll}
                    onRetry={queue.retry}
                    onDismiss={queue.dismiss}
                    onClose={queue.clear}
                />
            )}

            {queue.prompt && (
                <ClashDialog
                    key={queue.prompt.id}
                    names={queue.promptNames}
                    folderName={queue.prompt.folderName}
                    onResolve={(choice) => queue.resolveClash(queue.prompt!.id, choice)}
                />
            )}
        </>
    )
}

export default FileUploader
