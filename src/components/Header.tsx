
import React, { Suspense } from 'react'
import { Button } from './ui/button'
import SearchBox from '@/components/search/SearchBox'
import FileUploader from '@/components/FileUploader'
import { signOutUser } from '@/lib/appwrite/actions/user.action'
import ThemeToggle from '@/components/brand/ThemeToggle'
import { PaletteButton } from '@/components/palette/CommandPalette'
import { LogOut } from 'lucide-react'

const Header = ({ userId, accountId }: { userId: string, accountId: string }) => {
    return (
        <header className='header'>
            {/* SearchBox reads ?q, which needs a Suspense boundary */}
            <Suspense fallback={<div className='search' />}>
                <SearchBox />
            </Suspense>
            <div className='header-wrapper'>
                <PaletteButton />
                <FileUploader ownerId={userId} accountId={accountId} globalDrop />
                <ThemeToggle />
                <form action={
                    async () => {
                        'use server';
                        await signOutUser()
                    }
                }>
                    <Button
                        type='submit'
                        className='sign-out-button'
                        aria-label='Sign out'
                        title='Sign out'>
                        <LogOut className='size-5' aria-hidden />
                    </Button>
                </form>
            </div>
        </header>
    )
}

export default Header