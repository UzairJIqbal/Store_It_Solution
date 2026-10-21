"use client"
import React from 'react'
import Link from 'next/link'
import { ChevronsUpDown, Cloud, LogOut } from 'lucide-react'
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { signOutUser } from '@/lib/appwrite/actions/user.action'
import { cn } from '@/lib/utils'
import { initialsOf } from './nav-items'

export const Avatar = ({ fullName, email, className }: { fullName: string, email: string, className?: string }) => (
    <span aria-hidden className={cn('flex-center size-9 shrink-0 rounded-full bg-brand/15 text-[13px] font-semibold text-brand', className)}>
        {initialsOf(fullName, email)}
    </span>
)

// Who is signed in, pinned to the bottom of the sidebar. Sign out sits behind a labelled menu item, not a lone icon.
const AccountMenu = ({ fullName, email }: { fullName: string, email: string }) => (
    <DropdownMenu>
        <DropdownMenuTrigger className='sidebar-account' aria-label={`Account: ${fullName}`}>
            <Avatar fullName={fullName} email={email} />
            <span className='hidden min-w-0 flex-1 text-left lg:block'>
                <span className='subtitle-2 block truncate capitalize text-light-100'>{fullName}</span>
                <span className='caption block truncate text-light-200'>{email}</span>
            </span>
            <ChevronsUpDown className='hidden size-4 shrink-0 text-light-200 lg:block' aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent side='top' align='start' className='browser-menu w-[240px]'>
            <DropdownMenuLabel className='font-normal'>
                <span className='subtitle-2 block truncate capitalize'>{fullName}</span>
                <span className='caption block truncate text-light-200'>{email}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
                <Link href='/storage'><Cloud aria-hidden /> Storage</Link>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => { void signOutUser() }}>
                <LogOut aria-hidden /> Sign out
            </DropdownMenuItem>
        </DropdownMenuContent>
    </DropdownMenu>
)

export default AccountMenu
