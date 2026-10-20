'use client'
import React from 'react'
import { fileDocument } from '../../../types'
import { useLifecycle } from './LifecycleProvider'

// Wraps a file row or card from a server-rendered list so a click opens the viewer on that file,
// with the rest of the list one arrow key away
const OpenFile = ({ files, index, className, children, label }: {
    files: fileDocument[],
    index: number,
    className?: string,
    children: React.ReactNode,
    label?: string,
}) => {
    const { openPreview } = useLifecycle()
    const open = () => openPreview(files, index)
    return (
        <div
            role='button'
            tabIndex={0}
            aria-label={label ?? `Open ${files[index].name}`}
            className={className}
            onClick={(e) => {
                // React events bubble out of portals (menus, dialogs); only react to the row's own DOM
                if (!e.currentTarget.contains(e.target as Node)) return
                // Menus and buttons inside the row handle their own clicks
                if ((e.target as HTMLElement).closest('button, a')) return
                open()
            }}
            onKeyDown={(e) => {
                if (e.target !== e.currentTarget) return
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    open()
                }
            }}
        >
            {children}
        </div>
    )
}

export default OpenFile
