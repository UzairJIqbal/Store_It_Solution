"use client"
import Link from 'next/link'
import React from 'react'
import { cn, isNavActive } from '@/lib/utils'
import { usePathname } from 'next/navigation'
import StorageMeter from './StorageMeter'
import Logo from './brand/Logo'
import { ChevronRight } from 'lucide-react'
import FolderTree, { ROOT_KEY, TreeFolder, useTreeExpansion } from './FolderTree'
import { navGroups } from './nav/nav-items'
import AccountMenu from './nav/AccountMenu'

type props = {
    fullName: string,
    email: string,
    storage?: { used: number, all: number },
    folders?: TreeFolder[],
}

const Sidebar = ({ fullName, email, storage, folders = [] }: props) => {
    const pathname = usePathname()
    const tree = useTreeExpansion(folders, pathname)
    const rootOpen = tree.expanded.has(ROOT_KEY)
    return <aside className='sidebar'>
        <Link href="/" className='sidebar-logo'>
            <Logo compact markClassName='size-9' className='[&>span]:text-[22px]' />
        </Link>

        <nav className='sidebar-nav' aria-label='Main'>
            {navGroups.map((group, g) => (
                <ul key={g} className='sidebar-nav-group'>
                    {group.items.map(({ name, icon: Icon, url }) => {
                        const active = isNavActive(pathname, url)
                        return (
                            <li key={name}>
                                <div className='relative'>
                                    <Link href={url} aria-current={active ? 'page' : undefined} title={name}
                                        className={cn('sidebar-nav-item', active && 'shad-active')}>
                                        <Icon className='size-5 shrink-0' aria-hidden strokeWidth={active ? 2.25 : 1.75} />
                                        <span className='hidden truncate lg:block'>{name}</span>
                                    </Link>
                                    {url === '/files' && folders.length > 0 && (
                                        <button type='button' className='sidebar-nav-expand'
                                            aria-expanded={rootOpen} aria-label={rootOpen ? 'Hide folders' : 'Show folders'}
                                            onClick={() => tree.toggle(ROOT_KEY)}>
                                            <ChevronRight className={cn('size-4 transition-transform', rootOpen && 'rotate-90')} aria-hidden />
                                        </button>
                                    )}
                                </div>
                                {url === '/files' && rootOpen && (
                                    <div className='sidebar-tree' aria-label='Folders'>
                                        <FolderTree folders={folders} {...tree} />
                                    </div>
                                )}
                            </li>
                        )
                    })}
                </ul>
            ))}
        </nav>

        <div className='sidebar-footer'>
            {storage && <StorageMeter used={storage.used} total={storage.all} />}
            <AccountMenu fullName={fullName} email={email} />
        </div>
    </aside>
}

export default Sidebar
