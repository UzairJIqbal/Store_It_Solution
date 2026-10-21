'use client'
import React, { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ChevronLeft, ChevronRight, Download, ExternalLink, FileQuestion, Info, Loader2, Music, Star, UserPlus } from 'lucide-react'
import { errorToast, undoToast } from '@/lib/undo'
import { fileDocument } from '../../../types'
import Thumbnail from '@/components/Thumbnail'
import FileDetails from '@/components/FileDetails'
import { cn, convertFileSize, fileDownloadUrl, fileViewUrl } from '@/lib/utils'
import { toggleStar } from '@/lib/appwrite/actions/lifecycle.action'

// Text files up to this size are shown inline; bigger ones would freeze the page
export const TEXT_PREVIEW_LIMIT = 1024 * 1024
const TEXT_EXTENSIONS = new Set([
    'txt', 'md', 'markdown', 'csv', 'tsv', 'json', 'log', 'xml', 'yml', 'yaml', 'ini', 'toml', 'env',
    'js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'css', 'scss', 'html', 'htm', 'py', 'rb', 'go', 'rs', 'java', 'kt',
    'c', 'h', 'cpp', 'hpp', 'cs', 'php', 'sh', 'zsh', 'sql', 'swift', 'srt', 'vtt',
])
const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'avif', 'bmp', 'ico'])
const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'mov', 'm4v', 'ogv'])
const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'ogg', 'oga', 'm4a', 'aac', 'flac', 'opus', 'weba'])

export type PreviewKind = 'image' | 'video' | 'audio' | 'pdf' | 'text' | 'none'

// What the viewer can render in the browser itself; everything else gets the download screen
export const previewKind = (file: Pick<fileDocument, 'type' | 'extension'>): PreviewKind => {
    const ext = (file.extension ?? '').toLowerCase()
    if (ext === 'pdf') return 'pdf'
    if (IMAGE_EXTENSIONS.has(ext)) return 'image'
    if (VIDEO_EXTENSIONS.has(ext)) return 'video'
    if (AUDIO_EXTENSIONS.has(ext)) return 'audio'
    if (TEXT_EXTENSIONS.has(ext)) return 'text'
    return 'none'
}

const isTypingTarget = (target: EventTarget | null) =>
    target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))

const NoPreview = ({ file, reason }: { file: fileDocument, reason?: string }) => (
    <div className='preview-empty'>
        <FileQuestion className='size-16 text-white/70' aria-hidden />
        <p className='h4 text-white'>{reason ?? 'No preview available'}</p>
        <p className='body-2 text-white/70'>{file.name} · {convertFileSize(file.size)}</p>
        <a href={fileDownloadUrl(file.$id)} download={file.name} className='preview-download-btn'>
            <Download className='size-5' aria-hidden />Download
        </a>
    </div>
)

const TextPreview = ({ file }: { file: fileDocument }) => {
    const [text, setText] = useState<string | null>(null)
    const [failed, setFailed] = useState(false)

    useEffect(() => {
        const controller = new AbortController()
        setText(null)
        setFailed(false)
        fetch(fileViewUrl(file.$id), { signal: controller.signal })
            .then((res) => (res.ok ? res.text() : Promise.reject(new Error(String(res.status)))))
            .then(setText)
            .catch((error) => { if (error?.name !== 'AbortError') setFailed(true) })
        return () => controller.abort()
    }, [file.$id])

    if (failed) return <NoPreview file={file} reason="Couldn't load this file" />
    if (text === null) return <Loader2 className='size-8 animate-spin text-white' aria-label='Loading' />
    return <pre className='preview-text' tabIndex={0} aria-label={`Contents of ${file.name}`}>{text}</pre>
}

const PreviewBody = ({ file }: { file: fileDocument }) => {
    const src = fileViewUrl(file.$id)
    const [broken, setBroken] = useState(false)
    useEffect(() => setBroken(false), [file.$id])
    if (broken) return <NoPreview file={file} reason="Couldn't load this file" />

    switch (previewKind(file)) {
        case 'image':
            // eslint-disable-next-line @next/next/no-img-element
            return <img key={file.$id} src={src} alt={file.name} className='preview-image' onError={() => setBroken(true)} />
        case 'video':
            return <video key={file.$id} src={src} controls autoPlay className='preview-media' onError={() => setBroken(true)} />
        case 'audio':
            return (
                <div className='preview-audio'>
                    <Music className='size-20 text-white/80' aria-hidden />
                    <p className='subtitle-1 text-white'>{file.name}</p>
                    <audio key={file.$id} src={src} controls autoPlay className='w-full' onError={() => setBroken(true)} />
                </div>
            )
        case 'pdf':
            return <iframe key={file.$id} src={src} title={file.name} className='preview-frame' />
        case 'text':
            return file.size > TEXT_PREVIEW_LIMIT
                ? <NoPreview file={file} reason='This file is too large to preview' />
                : <TextPreview file={file} />
        default:
            return <NoPreview file={file} />
    }
}

interface Props {
    files: fileDocument[],
    index: number,
    onIndexChange: (index: number) => void,
    onClose: () => void,
    onShare: (file: fileDocument) => void,
    onStarChange: (file: fileDocument, starred: boolean) => void,
}

// Full-screen viewer: one file at a time, ← and → step through the list it was opened from
const FilePreview = ({ files, index, onIndexChange, onClose, onShare, onStarChange }: Props) => {
    const file = files[index]
    const [showDetails, setShowDetails] = useState(false)
    const [starred, setStarred] = useState(Boolean(file?.isStarred))
    const opened = useRef(new Set<string>())
    const root = useRef<HTMLDivElement>(null)
    const returnFocus = useRef<Element | null>(null)

    useEffect(() => setStarred(Boolean(file?.isStarred)), [file])

    // A file counts as opened once it has been on screen for a second, once per visit of the viewer;
    // stepping past it with the arrows doesn't put it in Recent
    useEffect(() => {
        if (!file || opened.current.has(file.$id)) return
        const fileId = file.$id
        const timer = setTimeout(() => {
            opened.current.add(fileId)
            fetch(`/api/files/${fileId}/opened`, { method: 'POST' }).catch(() => { })
        }, 1000)
        return () => clearTimeout(timer)
    }, [file])

    useEffect(() => {
        returnFocus.current = document.activeElement
        root.current?.focus()
        const overflow = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        return () => {
            document.body.style.overflow = overflow
            if (returnFocus.current instanceof HTMLElement) returnFocus.current.focus()
        }
    }, [])

    const hasPrev = index > 0
    const hasNext = index < files.length - 1

    const keyHandler = useRef<(e: KeyboardEvent) => void>(() => { })
    keyHandler.current = (e: KeyboardEvent) => {
        // Another dialog (share) on top of the viewer owns the keyboard
        if (document.querySelectorAll('[role="dialog"]').length > 1 || isTypingTarget(e.target)) return
        if (e.key === 'Escape') {
            e.preventDefault()
            onClose()
            return
        }
        // Media elements use the arrows to seek
        if (e.target instanceof HTMLMediaElement) return
        if (e.key === 'ArrowLeft' && hasPrev) {
            e.preventDefault()
            onIndexChange(index - 1)
        } else if (e.key === 'ArrowRight' && hasNext) {
            e.preventDefault()
            onIndexChange(index + 1)
        }
    }
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => keyHandler.current(e)
        window.addEventListener('keydown', onKeyDown, true)
        return () => window.removeEventListener('keydown', onKeyDown, true)
    }, [])

    if (!file) return null
    const canShare = (file.role ?? 'owner') !== 'viewer'

    const setStar = async (next: boolean) => {
        setStarred(next)
        const result = await toggleStar({ fileId: file.$id, starred: next })
        if (!result.ok) {
            setStarred(!next)
            errorToast(result.error)
            return false
        }
        onStarChange(file, next)
        return true
    }

    const star = async () => {
        const next = !starred
        if (await setStar(next)) undoToast(next ? 'Added to Starred' : 'Removed from Starred', () => { setStar(!next) })
    }

    return (
        <div ref={root} className='preview-overlay' role='dialog' aria-modal='true' aria-label={`Preview of ${file.name}`} tabIndex={-1}>
            <header className='preview-header'>
                <div className='flex min-w-0 items-center gap-3'>
                    <button type='button' className='preview-icon-btn' onClick={onClose} aria-label='Close preview' title='Close (Esc)'>
                        <ArrowLeft className='size-5' aria-hidden />
                    </button>
                    <Thumbnail type={file.type} extension={file.extension} url={file.url} className='!size-8 shrink-0 !bg-white/10' imageClassName='!size-5' />
                    <h2 className='subtitle-1 truncate text-white' title={file.name}>{file.name}</h2>
                </div>
                <div className='flex shrink-0 items-center gap-1'>
                    <button type='button' className='preview-icon-btn' onClick={star} aria-pressed={starred}
                        aria-label={starred ? 'Remove from Starred' : 'Add to Starred'} title={starred ? 'Remove from Starred' : 'Add to Starred'}>
                        <Star className={cn('size-5', starred && 'fill-current text-[rgb(var(--ember))]')} aria-hidden />
                    </button>
                    {canShare && (
                        <button type='button' className='preview-text-btn' onClick={() => onShare(file)} aria-label='Share'>
                            <UserPlus className='size-5' aria-hidden /><span className='hidden md:inline'>Share</span>
                        </button>
                    )}
                    <a href={fileDownloadUrl(file.$id)} download={file.name} className='preview-text-btn' aria-label='Download'>
                        <Download className='size-5' aria-hidden /><span className='hidden md:inline'>Download</span>
                    </a>
                    <a href={fileViewUrl(file.$id)} target='_blank' rel='noopener noreferrer' className='preview-icon-btn' aria-label='Open in new tab' title='Open in new tab'>
                        <ExternalLink className='size-5' aria-hidden />
                    </a>
                    <button type='button' className={cn('preview-icon-btn', showDetails && 'bg-white/20')} onClick={() => setShowDetails((v) => !v)}
                        aria-pressed={showDetails} aria-label='Details' title='Details'>
                        <Info className='size-5' aria-hidden />
                    </button>
                </div>
            </header>

            <div className='preview-main'>
                <div className='preview-stage' onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
                    {hasPrev && (
                        <button type='button' className='preview-nav-btn left-4' onClick={() => onIndexChange(index - 1)} aria-label='Previous file' title='Previous (←)'>
                            <ChevronLeft className='size-7' aria-hidden />
                        </button>
                    )}
                    <PreviewBody key={file.$id} file={file} />
                    {hasNext && (
                        <button type='button' className='preview-nav-btn right-4' onClick={() => onIndexChange(index + 1)} aria-label='Next file' title='Next (→)'>
                            <ChevronRight className='size-7' aria-hidden />
                        </button>
                    )}
                    {files.length > 1 && <p className='preview-counter' aria-live='polite'>{index + 1} of {files.length}</p>}
                </div>
                {showDetails && (
                    <aside className='preview-details' aria-label='File details'>
                        <FileDetails key={file.$id} target={{ kind: 'file', file: { ...file, isStarred: starred } }} />
                    </aside>
                )}
            </div>
        </div>
    )
}

export default FilePreview
