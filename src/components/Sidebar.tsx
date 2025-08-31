"use client"
import Image from 'next/image'
import Link from 'next/link'
import React from 'react'
import { avatarPlaceholderUrl, navItems } from '../../constants'
import { cn } from '@/lib/utils'
import { usePathname } from 'next/navigation'
import path from 'path'
import { email } from 'zod'
import { Props } from 'next/script'

type props = {
    fullName: string,
    email: string,
    avatar: string
}

const Sidebar = ({ fullName, email, avatar }: props) => {
    const pathname = usePathname()
    return <aside className='sidebar'>
        <Link href="/">
            <Image
                src="/assets/icons/logo-full.svg"
                alt='logo'
                width={200}
                height={200}
            />
        </Link>

        <nav className='sidebar-nav'>
            <ul className='flex flex-1 flex-col gap-6'>
                {
                    navItems.map(({ name, icon, url }) => (
                        <Link key={name} href={url}>
                            <li className={cn("sidebar-nav-item", (
                                pathname === url && "shad-active"
                            ))}>
                                <Image
                                    src={icon}
                                    alt={name}
                                    width={24}
                                    height={24}
                                    className={cn('nav-icon', (
                                        pathname === url && 'nav-icon-active'
                                    ))}
                                />
                                <p className='hidden lg:block'>{name}</p>
                            </li>
                        </Link>
                    ))
                }
            </ul>
        </nav>

        <Image
            src="/assets/images/files-2.png"
            alt='logo'
            width={506}
            height={418}
            className='w-full'
        />

        <div className='sidebar-user-info'>
            <Image
                src={avatarPlaceholderUrl}
                alt='Avatar'
                height={44}
                width={44}
                className='sidebar-user-avatar'
            />
            <div className='hidden lg:block'>
                <p className='suntitle-2 capitalize'>{fullName}</p>
                <p className='caption'>{email}</p>
            </div>
        </div>
    </aside>
}

export default Sidebar
