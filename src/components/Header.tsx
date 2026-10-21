
import React, { Suspense } from 'react'
import SearchBox from '@/components/search/SearchBox'
import FileUploader from '@/components/FileUploader'
import ThemeToggle from '@/components/brand/ThemeToggle'
import { PaletteButton } from '@/components/palette/CommandPalette'

const Header = ({ userId, accountId }: { userId: string, accountId: string }) => {
    return (
        <header className='header'>
            {/* SearchBox reads ?q, which needs a Suspense boundary */}
            <Suspense fallback={<div className='search' />}>
                <SearchBox />
            </Suspense>
            <div className='header-wrapper'>
                <PaletteButton />
                {/* Secondary here: each page's own New button is the primary action */}
                <FileUploader ownerId={userId} accountId={accountId} globalDrop className='uploader-button-secondary' />
                <ThemeToggle />
            </div>
        </header>
    )
}

export default Header