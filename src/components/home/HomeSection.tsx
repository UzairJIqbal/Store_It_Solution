'use client'
import React, { useEffect, useId, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

const key = (id: string) => `storeit:home-collapsed:${id}`

// A Home section whose heading folds it away; the choice is remembered per browser
const HomeSection = ({ id, title, actions, children }: {
    id: string,
    title: string,
    actions?: React.ReactNode,
    children: React.ReactNode,
}) => {
    const bodyId = useId()
    const [open, setOpen] = useState(true)

    useEffect(() => {
        try { setOpen(localStorage.getItem(key(id)) !== '1') } catch { /* storage blocked: stay open */ }
    }, [id])

    const toggle = () => setOpen((o) => {
        try { localStorage.setItem(key(id), o ? '1' : '0') } catch { /* not remembered */ }
        return !o
    })

    return (
        <section className='w-full' aria-labelledby={`${bodyId}-title`}>
            <div className='mb-3 flex items-center justify-between gap-3'>
                <h2 id={`${bodyId}-title`}>
                    <button type='button' className='home-section-toggle' aria-expanded={open} aria-controls={bodyId} onClick={toggle}>
                        <ChevronDown className={cn('size-5 transition-transform duration-200', !open && '-rotate-90')} aria-hidden />
                        {title}
                    </button>
                </h2>
                {open && actions}
            </div>
            <div id={bodyId} hidden={!open}>{children}</div>
        </section>
    )
}

export default HomeSection
