'use client'

import React, { useState } from 'react'
import { AlertCircle, Ban, CheckCircle2, ChevronDown, FolderClosed, RotateCw, WifiOff, X } from 'lucide-react'
import Thumbnail from '@/components/Thumbnail'
import { cn, convertFileSize, getFileType } from '@/lib/utils'
import { groupStatus, isActive, UploadRow, UploadStatus } from '@/lib/upload/useUploadQueue'
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
    AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'

interface Props {
    rows: UploadRow[],
    summary: { active: number, done: number, failed: number, canceled: number },
    online: boolean,
    etaSeconds: number | null,
    onCancel: (rowId: string) => void,
    onCancelAll: () => void,
    onRetry: (rowId: string) => void,
    onDismiss: (rowId: string) => void,
    onClose: () => void,
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

const formatEta = (seconds: number) => {
    if (seconds < 60) return 'Less than a minute left'
    const minutes = Math.round(seconds / 60)
    if (minutes < 60) return `${minutes} min left`
    return `${Math.floor(minutes / 60)} hr ${minutes % 60} min left`
}

const ProgressRing = ({ percent, paused, label }: { percent: number, paused?: boolean, label: string }) => {
    const radius = 9
    const circumference = 2 * Math.PI * radius
    return (
        <svg
            viewBox='0 0 24 24'
            className='size-6 -rotate-90'
            role='progressbar'
            aria-label={label}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(percent)}
        >
            <circle cx='12' cy='12' r={radius} fill='none' strokeWidth='3' className='stroke-light-300' />
            <circle
                cx='12' cy='12' r={radius} fill='none' strokeWidth='3' strokeLinecap='round'
                className={cn('transition-[stroke-dashoffset] duration-300', paused ? 'stroke-light-200' : 'stroke-brand')}
                strokeDasharray={circumference}
                strokeDashoffset={circumference * (1 - percent / 100)}
            />
        </svg>
    )
}

const StatusIcon = ({ status, percent, name }: { status: UploadStatus, percent: number, name: string }) => {
    switch (status) {
        case 'done': return <CheckCircle2 className='size-6 text-green' aria-label='Uploaded' />
        case 'failed': return <AlertCircle className='size-6 text-error' aria-label='Failed' />
        case 'canceled': return <Ban className='size-5 text-light-200' aria-label='Canceled' />
        default: return <ProgressRing percent={percent} paused={status === 'paused'} label={`Uploading ${name}`} />
    }
}

const rowCaption = (status: UploadStatus, sent: number, total: number, error?: string) => {
    switch (status) {
        case 'preparing': return 'Preparing…'
        case 'waiting': return 'Waiting for your choice'
        case 'queued': return `Waiting · ${convertFileSize(total)}`
        case 'paused': return `Paused · ${convertFileSize(sent)} of ${convertFileSize(total)}`
        case 'finishing': return 'Saving…'
        case 'done': return convertFileSize(total)
        case 'failed': return error ?? 'Upload failed'
        case 'canceled': return error === 'Skipped' ? 'Skipped' : 'Upload canceled'
        default: return `${convertFileSize(sent)} of ${convertFileSize(total)} · ${Math.floor(total ? (sent / total) * 100 : 0)}%`
    }
}

const UploadTray = ({ rows, summary, online, etaSeconds, onCancel, onCancelAll, onRetry, onDismiss, onClose }: Props) => {
    const [collapsed, setCollapsed] = useState(false)
    const [confirmClose, setConfirmClose] = useState(false)

    const title = summary.active > 0
        ? online ? `Uploading ${plural(summary.active, 'item')}` : "Upload paused, you're offline"
        : summary.failed > 0
            ? `${plural(summary.failed, 'upload')} failed`
            : summary.done > 0
                ? `${plural(summary.done, 'upload')} complete`
                : `${plural(summary.canceled, 'upload')} canceled`
    const subtitle = summary.active > 0 && online
        ? etaSeconds === null ? 'Starting…' : formatEta(etaSeconds)
        : null

    const requestClose = () => (summary.active > 0 ? setConfirmClose(true) : onClose())

    const renderRow = (row: UploadRow) => {
        let id: string, name: string, status: UploadStatus, sent: number, total: number, error: string | undefined
        let canRetry = false
        let icon: React.ReactNode
        let detail: string

        if (row.kind === 'file') {
            const { item } = row
            id = item.id
            name = item.name
            status = item.status
            sent = item.sent
            total = item.file.size
            error = item.error
            canRetry = item.status === 'failed' && item.retryable
            const { type, extension } = getFileType(item.name)
            icon = <Thumbnail type={type} extension={extension} url={item.previewUrl} />
            detail = rowCaption(status, sent, total, error)
        } else {
            const { group, items } = row
            const counted = items.filter((i) => !(i.status === 'canceled' && i.error === 'Skipped'))
            id = group.id
            name = group.name
            status = groupStatus(group, items)
            sent = counted.reduce((sum, i) => sum + i.sent, 0)
            total = counted.reduce((sum, i) => sum + i.file.size, 0)
            error = group.error ?? items.find((i) => i.status === 'failed')?.error
            canRetry = items.some((i) => i.status === 'failed' && i.retryable)
            icon = (
                <div className='flex size-[50px] shrink-0 items-center justify-center rounded-full bg-brand/10'>
                    <FolderClosed className='size-6 text-brand' aria-hidden />
                </div>
            )
            const finished = items.filter((i) => i.status === 'done').length
            detail = status === 'preparing' ? 'Creating folders…'
                : status === 'failed' ? (error ?? 'Upload failed')
                    : status === 'canceled' ? 'Upload canceled'
                        : `${finished} of ${plural(items.length, 'file')}`
        }

        const percent = total ? (sent / total) * 100 : 0
        const cancelable = isActive(status) && status !== 'finishing'

        return (
            <li
                key={id}
                className='uploader-preview-item group'
                title={isActive(status) ? `${convertFileSize(sent)} of ${convertFileSize(total)} (${Math.floor(percent)}%)` : undefined}
            >
                <div className='flex min-w-0 items-center gap-3'>
                    {icon}
                    <div className='min-w-0'>
                        <p className='preview-item-name'>{name}</p>
                        <p className={cn('caption', status === 'failed' ? 'text-error' : 'text-light-200')}>{detail}</p>
                    </div>
                </div>

                <div className='flex shrink-0 items-center gap-1'>
                    {/* While uploading, hovering the row swaps the ring for a cancel button */}
                    <span className={cn(cancelable && 'group-hover:hidden group-focus-within:hidden')}>
                        <StatusIcon status={status} percent={percent} name={name} />
                    </span>
                    {/* The wrapper toggles visibility: the button's own class forces display: flex */}
                    {cancelable && (
                        <span className='hidden group-hover:block group-focus-within:block'>
                            <button
                                type='button'
                                className='uploader-tray-icon-btn'
                                onClick={() => onCancel(id)}
                                aria-label={`Cancel ${name}`}
                            >
                                <X className='size-4' />
                            </button>
                        </span>
                    )}
                    {canRetry && (
                        <button type='button' className='uploader-tray-icon-btn' onClick={() => onRetry(id)} aria-label={`Retry ${name}`}>
                            <RotateCw className='size-4' />
                        </button>
                    )}
                    {!isActive(status) && (
                        <button type='button' className='uploader-tray-icon-btn' onClick={() => onDismiss(id)} aria-label={`Dismiss ${name}`}>
                            <X className='size-4' />
                        </button>
                    )}
                </div>
            </li>
        )
    }

    return (
        <section className='uploader-tray' aria-label='Uploads'>
            <header className='uploader-tray-header'>
                <div className='min-w-0'>
                    <h4 className='h4 flex items-center gap-2' aria-live='polite'>
                        {!online && summary.active > 0 && <WifiOff className='size-5 shrink-0' aria-hidden />}
                        <span>{title}</span>
                    </h4>
                    {subtitle && <p className='caption text-light-200'>{subtitle}</p>}
                </div>
                <div className='flex shrink-0 items-center gap-1'>
                    {summary.active > 0 && (
                        <button type='button' className='uploader-tray-text-btn' onClick={onCancelAll}>Cancel all</button>
                    )}
                    <button
                        type='button'
                        className='uploader-tray-icon-btn'
                        onClick={() => setCollapsed((c) => !c)}
                        aria-label={collapsed ? 'Expand uploads' : 'Collapse uploads'}
                        aria-expanded={!collapsed}
                    >
                        <ChevronDown className={cn('size-5 transition-transform', collapsed && 'rotate-180')} />
                    </button>
                    <button type='button' className='uploader-tray-icon-btn' onClick={requestClose} aria-label='Close uploads'>
                        <X className='size-5' />
                    </button>
                </div>
            </header>

            {!collapsed && <ul className='uploader-tray-list'>{rows.map(renderRow)}</ul>}

            <AlertDialog open={confirmClose} onOpenChange={setConfirmClose}>
                <AlertDialogContent className='shad-alert-dialog'>
                    <AlertDialogHeader>
                        <AlertDialogTitle className='h3 text-center text-light-100'>
                            Cancel {plural(summary.active, 'upload')}?
                        </AlertDialogTitle>
                        <AlertDialogDescription className='subtitle-2 text-center text-light-100'>
                            Files that haven&apos;t finished uploading won&apos;t be saved.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className='flex flex-col gap-3 md:flex-row'>
                        <AlertDialogCancel className='modal-cancel-button'>Keep uploading</AlertDialogCancel>
                        <AlertDialogAction className='modal-submit-button' onClick={onClose}>Cancel uploads</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </section>
    )
}

export default UploadTray
