"use client"
import React, { useState } from 'react'
import {
    Sheet,
    SheetContent,
    SheetTitle,
    SheetTrigger,
} from "@/components/ui/sheet";
import Image from 'next/image';
import { Separator } from "@/components/ui/separator"
import { avatarPlaceholderUrl, navItems } from '../../constants';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn, isNavActive } from '@/lib/utils';
import FileUploader from './FileUploader';
import { Button } from './ui/button';
import { signOutUser } from '@/lib/appwrite/actions/user.action';
import Logo from './brand/Logo';
import ThemeToggle from './brand/ThemeToggle';
import { LogOut, Menu } from 'lucide-react';

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
                <Logo markClassName='size-9' className='[&>span]:text-[22px]' />
            </Link>
            <Sheet open={open} onOpenChange={setOpen}>
                <SheetTrigger className='mobile-menu-trigger' aria-label='Open menu'>
                    <Menu className='size-6' aria-hidden />
                </SheetTrigger>
                <SheetContent className="shad-sheet h-screen px-3">

                    <SheetTitle>
                        <div className="header-user">
                            <Image
                                src={avatarPlaceholderUrl}
                                alt="avatar"
                                width={44}
                                height={44}
                                className="header-user-avatar"
                            />
                            <div className="sm:hidden lg:block">
                                <p className="subtitle-2 capitalize">{fullName}</p>
                                <p className="caption">{email}</p>
                            </div>
                        </div>
                        <Separator className="mb-4 bg-light-200/20" />
                    </SheetTitle>

                    <nav className="mobile-nav">
                        <ul className="mobile-nav-list">
                            {navItems.map(({ url, name, icon }) => (
                                <Link key={name} href={url} className="lg:w-full">
                                    <li
                                        className={cn(
                                            "mobile-nav-item",
                                            isNavActive(pathname, url) && "shad-active",
                                        )}
                                    >
                                        <Image
                                            src={icon}
                                            alt={name}
                                            width={24}
                                            height={24}
                                            className={cn(
                                                "nav-icon",
                                                isNavActive(pathname, url) && "nav-icon-active",
                                            )}
                                        />
                                        <p>{name}</p>
                                    </li>
                                </Link>
                            ))}
                        </ul>
                    </nav>

                    <Separator className="my-5 bg-light-200/20" />

                    <div className="flex flex-col justify-between gap-5 pb-5">
                        <FileUploader accountId={accountId} ownerId={ownerId} />
                        <ThemeToggle withLabel className='mobile-theme-toggle' />
                        <Button
                            type="submit"
                            className="mobile-sign-out-button"
                            onClick={async () => await signOutUser()}
                        >
                            <LogOut className='size-5' aria-hidden />
                            <p>Logout</p>
                        </Button>
                    </div>
                </SheetContent>
            </Sheet>
        </header>
    )
}

export default MobileNavigation
