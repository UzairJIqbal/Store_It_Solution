'use client'
import React from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { useBrowserActions } from './actions'

export interface Trail {
    id: string | null,
    name: string,
}

interface Props {
    // Root first, current folder last
    trail: Trail[],
    activeDropId: string | null | undefined,
    dropProps: (target: Trail) => React.HTMLAttributes<HTMLElement>,
    currentMenu: React.ReactNode,
}

const MAX_VISIBLE = 4

const Breadcrumbs = ({ trail, activeDropId, dropProps, currentMenu }: Props) => {
    const { folderHref } = useBrowserActions()
    const current = trail[trail.length - 1]
    const parents = trail.slice(0, -1)

    // Long paths keep the root and the nearest parents; the rest fold into a menu
    const hidden = parents.length > MAX_VISIBLE - 1 ? parents.slice(1, parents.length - (MAX_VISIBLE - 2)) : []
    const visible = hidden.length ? [parents[0], null, ...parents.slice(parents.length - (MAX_VISIBLE - 2))] : parents

    return (
        <nav aria-label='Folder path' className='breadcrumbs'>
            <ol className='flex min-w-0 flex-wrap items-center gap-1'>
                {visible.map((crumb, index) => (
                    <li key={crumb?.id ?? (crumb ? 'root' : 'more')} className='flex min-w-0 items-center gap-1'>
                        {crumb ? (
                            <Link
                                href={folderHref(crumb.id)}
                                className={cn('breadcrumb-link', activeDropId === crumb.id && 'drop-target-active')}
                                {...dropProps(crumb)}
                            >
                                {crumb.name}
                            </Link>
                        ) : (
                            <DropdownMenu>
                                <DropdownMenuTrigger className='breadcrumb-link' aria-label='Show hidden folders'>…</DropdownMenuTrigger>
                                <DropdownMenuContent align='start' className='browser-menu'>
                                    {hidden.map((h) => (
                                        <DropdownMenuItem key={h.id} asChild>
                                            <Link href={folderHref(h.id)}>{h.name}</Link>
                                        </DropdownMenuItem>
                                    ))}
                                </DropdownMenuContent>
                            </DropdownMenu>
                        )}
                        {index < visible.length && <ChevronRight className='size-5 shrink-0 text-light-200' aria-hidden />}
                    </li>
                ))}
                <li className='flex min-w-0 items-center'>
                    <DropdownMenu>
                        <DropdownMenuTrigger className='breadcrumb-current' aria-label={`${current.name} folder actions`}>
                            <h1 className='h1 truncate'>{current.name}</h1>
                            <ChevronDown className='size-6 shrink-0' aria-hidden />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align='start' className='browser-menu'>
                            {currentMenu}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </li>
            </ol>
        </nav>
    )
}

export default Breadcrumbs
