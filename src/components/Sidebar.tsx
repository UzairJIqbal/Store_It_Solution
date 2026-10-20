"use client"
import Image from 'next/image'
import Link from 'next/link'
import React from 'react'
import { avatarPlaceholderUrl, navItems } from '../../constants'
import { cn, isNavActive } from '@/lib/utils'
import { usePathname } from 'next/navigation'
import StorageMeter from './StorageMeter'
import Logo from './brand/Logo'
import { ChevronRight } from 'lucide-react'
import FolderTree, { ROOT_KEY, TreeFolder, useTreeExpansion } from './FolderTree'

type props = {
    fullName: string,
    email: string,
    avatar: string,
    storage?: { used: number, all: number },
    folders?: TreeFolder[],
}

const Sidebar = ({ fullName, email, avatar, storage, folders = [] }: props) => {
    const pathname = usePathname()
    const tree = useTreeExpansion(folders, pathname)
    const rootOpen = tree.expanded.has(ROOT_KEY)
    return <aside className='sidebar'>
        <Link href="/" className='sidebar-logo'>
            <Logo compact markClassName='size-11' />
        </Link>

        <nav className='sidebar-nav'>
            <ul className='flex flex-1 flex-col gap-6'>
                {
                    navItems.map(({ name, icon, url }) => (
                        <React.Fragment key={name}>
                        <div className='relative'>
                        <Link href={url}>
                            <li className={cn("sidebar-nav-item", (
                                isNavActive(pathname, url) && "shad-active"
                            ))}>
                                <Image
                                    src={icon}
                                    alt={name}
                                    width={24}
                                    height={24}
                                    className={cn('nav-icon', (
                                        isNavActive(pathname, url) && 'nav-icon-active'
                                    ))}
                                />
                                <p className='hidden lg:block'>{name}</p>
                            </li>
                        </Link>
                        {url === '/files' && (
                            <button type='button' className={cn('sidebar-nav-expand', isNavActive(pathname, url) && 'text-white')}
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
                        </React.Fragment>
                    ))
                }
            </ul>
        </nav>

        {storage && <StorageMeter used={storage.used} total={storage.all} />}

        <div className='sidebar-user-info'>
            <Image
                src={avatarPlaceholderUrl}
                alt='Avatar'
                height={44}
                width={44}
                className='sidebar-user-avatar'
            />
            <div className='hidden lg:block'>
                <p className='subtitle-2 capitalize'>{fullName}</p>
                <p className='caption'>{email}</p>
            </div>
        </div>
    </aside>
}

export default Sidebar
