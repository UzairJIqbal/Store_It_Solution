import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getFileByLinkToken } from '@/lib/appwrite/actions/access'
import { convertFileSize, fileDownloadUrl, fileViewUrl, formatDateTime, getFileIcon } from '@/lib/utils'
import Logo from '@/components/brand/Logo'

// Public page for "Anyone with the link". Lives outside (root) so it needs no sign-in.
// A wrong token, or a link the owner turned off, is a 404.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = { robots: { index: false, follow: false } }

const SharedLinkPage = async ({ params }: { params: Promise<{ token: string }> }) => {
    const { token } = await params
    const file = await getFileByLinkToken(token)
    if (!file) notFound()

    const owner = typeof file.ownerId === 'object' && file.ownerId ? file.ownerId.fullName : ''
    const view = fileViewUrl(file.$id, token)
    const preview = (() => {
        if (file.type === 'image' && file.extension !== 'svg') {
            // eslint-disable-next-line @next/next/no-img-element
            return <img src={view} alt={file.name} className='max-h-[60vh] w-auto rounded-[20px] object-contain' />
        }
        if (file.type === 'video') return <video src={view} controls className='max-h-[60vh] w-full rounded-[20px] bg-black' />
        if (file.type === 'audio') return <audio src={view} controls className='w-full' />
        return <Image src={getFileIcon(file.extension, file.type)} alt='' width={120} height={120} unoptimized />
    })()

    return (
        <main className='flex min-h-screen flex-col bg-light-400'>
            <header className='flex items-center justify-between bg-white px-5 py-4 sm:px-10'>
                <Link href='/' aria-label='StoreIt'>
                    <Logo markClassName='size-9' className='[&>span]:text-[22px]' />
                </Link>
                <a href={fileDownloadUrl(file.$id, token)} className='primary-btn flex h-[44px] items-center gap-2 rounded-full bg-brand px-5 text-white'>
                    <Image src='/assets/icons/download.svg' alt='' width={20} height={20} className='invert brightness-0' />
                    <span className='button'>Download</span>
                </a>
            </header>

            <section className='mx-auto flex w-full max-w-[960px] flex-1 flex-col items-center gap-6 px-4 py-10'>
                <div className='flex w-full flex-1 items-center justify-center rounded-[20px] bg-white p-6'>
                    {preview}
                </div>
                <div className='flex w-full flex-col gap-1 rounded-[20px] bg-white p-5'>
                    <h1 className='h3 break-all text-light-100'>{file.name}</h1>
                    <p className='body-2 text-light-200'>
                        {convertFileSize(file.size)} · {formatDateTime(file.$createdAt)}{owner ? ` · Shared by ${owner}` : ''}
                    </p>
                </div>
            </section>
        </main>
    )
}

export default SharedLinkPage
