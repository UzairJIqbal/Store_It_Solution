'use client'
import { ExternalToast, toast } from 'sonner'

// One place for "Done · Undo" toasts. The newest undo that is still on screen also answers ⌘Z / Ctrl+Z,
// the same way Drive's snackbar does.

const UNDO_WINDOW_MS = 8000

type Entry = { id: string | number, run: () => void | Promise<void>, expires: number }
let stack: Entry[] = []
let listening = false

const isTypingTarget = (target: EventTarget | null) =>
    target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))

const trigger = (entry: Entry) => {
    stack = stack.filter((e) => e !== entry)
    toast.dismiss(entry.id)
    return entry.run()
}

const listen = () => {
    if (listening || typeof window === 'undefined') return
    listening = true
    window.addEventListener('keydown', (e) => {
        if (e.key.toLowerCase() !== 'z' || !(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey) return
        // Text fields keep their own undo
        if (isTypingTarget(e.target)) return
        stack = stack.filter((entry) => entry.expires > Date.now())
        const latest = stack[stack.length - 1]
        if (!latest) return
        e.preventDefault()
        trigger(latest)
    })
}

export const undoToast = (message: string, onUndo: () => void | Promise<void>, options: ExternalToast = {}) => {
    listen()
    let entry: Entry
    const id = toast(message, {
        duration: UNDO_WINDOW_MS,
        ...options,
        action: { label: 'Undo', onClick: () => { void trigger(entry) } },
        classNames: { actionButton: 'toast-action-btn', cancelButton: 'toast-cancel-btn', ...options.classNames },
        onDismiss: () => { stack = stack.filter((e) => e !== entry) },
        onAutoClose: () => { stack = stack.filter((e) => e !== entry) },
    })
    entry = { id, run: onUndo, expires: Date.now() + UNDO_WINDOW_MS }
    stack.push(entry)
    return id
}

export const errorToast = (message: string) => toast(message, { className: 'error-toast' })
