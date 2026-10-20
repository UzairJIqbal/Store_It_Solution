import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { Inbox, Lock } from 'lucide-react'
import { getPublicDrop } from '@/lib/appwrite/actions/drops'
import Logo from '@/components/brand/Logo'
import ThemeToggle from '@/components/brand/ThemeToggle'
import DropUploader from '@/components/drops/DropUploader'

// Public "drop" page: anyone with the link can send files to the owner. Lives outside (root), so no sign-in.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Send files', robots: { index: false, follow: false } }

const CLOSED_COPY = {
    paused: 'The owner has paused this link.',
    expired: 'This link has expired.',
    full: 'This link has received all the files it can take.',
} as const

const DropPage = async ({ params }: { params: Promise<{ code: string }> }) => {
    const { code } = await params
    const drop = await getPublicDrop(code)
    if (!drop) notFound()

    return (
        <main className='drop-page'>
            <header className='flex items-center justify-between px-5 py-4 sm:px-10'>
                <Link href='/' aria-label='StoreIt'>
                    <Logo markClassName='size-9' className='[&>span]:text-[22px]' />
                </Link>
                <ThemeToggle />
            </header>

            <section className='drop-card'>
                <span className='drop-badge'><Inbox className='size-4' /> File request from {drop.ownerName}</span>
                <h1 className='h1 text-light-100'>{drop.title}</h1>
                {drop.message && <p className='body-1 whitespace-pre-line text-light-200'>{drop.message}</p>}

                {drop.status === 'open' ? (
                    <DropUploader code={drop.code} filesLeft={drop.filesLeft} />
                ) : (
                    <p className='drop-closed'><Lock className='size-5' /> {CLOSED_COPY[drop.status]}</p>
                )}

                <p className='caption text-light-200'>
                    Files go straight to {drop.ownerName}&apos;s StoreIt. You won&apos;t be able to see other people&apos;s files
                    {drop.expiresAt && drop.status === 'open' ? ` · Open until ${new Date(drop.expiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}.
                </p>
            </section>
        </main>
    )
}

export default DropPage
