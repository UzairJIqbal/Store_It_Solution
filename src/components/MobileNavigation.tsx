"use client"
import React, { useState } from 'react'
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetTitle,
    SheetTrigger,
} from "@/components/ui/sheet";
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn, isNavActive } from '@/lib/utils';
import FileUploader from './FileUploader';
import { signOutUser } from '@/lib/appwrite/actions/user.action';
import Logo from './brand/Logo';
import ThemeToggle from './brand/ThemeToggle';
import { LogOut, Menu } from 'lucide-react';
import { navGroups } from './nav/nav-items';
import { Avatar } from './nav/AccountMenu';

interface props {
    fullName: string,
    email: string,
    $id: string,
    accountId: string
}

const MobileNavigation = ({ fullName, email, accountId, $id: ownerId }: props) => {
    const pathname = usePathname()
    const [open, setOpen] = useState(false)
    return (
        <header className='mobile-header'>
            <Link href='/' className='flex items-center'>
                <Logo markClassName='size-8' className='[&>span]:text-[20px]' />
            </Link>
            <div className='flex items-center gap-2'>
                <FileUploader accountId={accountId} ownerId={ownerId} className='uploader-button-compact' />
                <Sheet open={open} onOpenChange={setOpen}>
                    <SheetTrigger className='mobile-menu-trigger' aria-label='Open menu'>
                        <Menu className='size-6' aria-hidden />
                    </SheetTrigger>
                    <SheetContent className="shad-sheet flex h-dvh w-[300px] flex-col gap-0 px-3 pb-4 pt-5">
                        <div className="mobile-account">
                            <Avatar fullName={fullName} email={email} />
                            <div className="min-w-0">
                                <SheetTitle className="subtitle-2 truncate capitalize text-light-100">{fullName}</SheetTitle>
                                <SheetDescription className="caption truncate text-light-200">{email}</SheetDescription>
                            </div>
                        </div>

                        <nav className="mobile-nav" aria-label='Main'>
                            {navGroups.map((group, g) => (
                                <ul key={g} className="mobile-nav-list">
                                    {group.items.map(({ url, name, icon: Icon }) => {
                                        const active = isNavActive(pathname, url)
                                        return (
                                            <li key={name}>
                                                <Link href={url} onClick={() => setOpen(false)} aria-current={active ? 'page' : undefined}
                                                    className={cn("mobile-nav-item", active && "shad-active")}>
                                                    <Icon className='size-5 shrink-0' aria-hidden />
                                                    {name}
                                                </Link>
                                            </li>
                                        )
                                    })}
                                </ul>
                            ))}
                        </nav>

                        <div className="flex flex-col gap-0.5 border-t border-light-300 pt-3">
                            <ThemeToggle withLabel className='mobile-theme-toggle' />
                            <button type="button" className="mobile-sign-out-button" onClick={() => { void signOutUser() }}>
                                <LogOut className='size-5' aria-hidden />
                                Sign out
                            </button>
                        </div>
                    </SheetContent>
                </Sheet>
            </div>
        </header>
    )
}

export default MobileNavigation
