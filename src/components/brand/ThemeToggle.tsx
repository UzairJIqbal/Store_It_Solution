'use client'
import React, { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { Moon, Sun } from 'lucide-react'
import { flushSync } from 'react-dom'
import { cn } from '@/lib/utils'

type ViewTransitionDocument = Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void> } }

// Switches the theme with a circular reveal from the point you clicked (View Transitions), or instantly where unsupported
export const switchTheme = (next: 'light' | 'dark', setTheme: (t: string) => void, origin?: { x: number, y: number }) => {
    const doc = document as ViewTransitionDocument
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!doc.startViewTransition || reduce) return setTheme(next)

    const x = origin?.x ?? window.innerWidth - 40
    const y = origin?.y ?? 40
    const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y))
    const transition = doc.startViewTransition(() => {
        flushSync(() => setTheme(next))
        // next-themes applies the class in an effect; apply it now so the new snapshot already has it
        document.documentElement.classList.toggle('dark', next === 'dark')
        document.documentElement.style.colorScheme = next
    })
    transition.ready.then(() => {
        document.documentElement.animate(
            { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
            { duration: 450, easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)', pseudoElement: '::view-transition-new(root)' },
        )
    }).catch(() => { })
}

const ThemeToggle = ({ className, withLabel = false }: { className?: string, withLabel?: boolean }) => {
    const { resolvedTheme, setTheme } = useTheme()
    const [mounted, setMounted] = useState(false)
    useEffect(() => setMounted(true), [])

    // The theme is unknown on the server, so render a neutral button until mounted
    const dark = mounted && resolvedTheme === 'dark'
    const label = dark ? 'Switch to light theme' : 'Switch to dark theme'
    return (
        <button type='button' className={cn('theme-toggle', className)} aria-label={label} title={label}
            onClick={(e) => switchTheme(dark ? 'light' : 'dark', setTheme, { x: e.clientX, y: e.clientY })}>
            <span className='relative size-5'>
                <Sun className={cn('theme-toggle-icon', dark ? 'rotate-90 scale-0 opacity-0' : 'rotate-0 scale-100 opacity-100')} aria-hidden />
                <Moon className={cn('theme-toggle-icon', dark ? 'rotate-0 scale-100 opacity-100' : '-rotate-90 scale-0 opacity-0')} aria-hidden />
            </span>
            {withLabel && <span>{dark ? 'Light theme' : 'Dark theme'}</span>}
        </button>
    )
}

export default ThemeToggle
