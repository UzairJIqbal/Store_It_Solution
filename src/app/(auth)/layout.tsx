import React from 'react'
import { FileText, Image as ImageIcon, Inbox, Sheet, Star } from 'lucide-react'
import Logo from '@/components/brand/Logo'

// A static glimpse of the file list: it shows what StoreIt does instead of describing it
const PREVIEW_ROWS = [
    { name: 'Client brief.pdf', meta: 'From a drop link · just now', icon: FileText, incoming: true },
    { name: 'Q3 budget.xlsx', meta: 'Shared with 3 people', icon: Sheet, starred: true },
    { name: 'Launch photos', meta: '24 images · Edited yesterday', icon: ImageIcon },
]

const ProductPreview = () => (
    <div className='auth-preview' aria-hidden>
        <div className='auth-preview-head'>
            <span className='subtitle-2 text-light-100'>My Files</span>
            <span className='auth-preview-drop'><Inbox className='size-3.5' /> 1 new upload</span>
        </div>
        <ul>
            {PREVIEW_ROWS.map(({ name, meta, icon: Icon, incoming, starred }) => (
                <li key={name} className='auth-preview-row'>
                    <span className='auth-preview-icon'><Icon className='size-4' /></span>
                    <span className='min-w-0 flex-1'>
                        <span className='subtitle-2 block truncate text-light-100'>{name}</span>
                        <span className='caption block truncate text-light-200'>{meta}</span>
                    </span>
                    {incoming && <span className='auth-preview-dot' />}
                    {starred && <Star className='size-4 fill-current text-ember' />}
                </li>
            ))}
        </ul>
    </div>
)

const Layout = ({ children }: { children: React.ReactNode }) => {
    return (
        <div className='flex min-h-screen'>
            <section className='auth-brand-panel'>
                <div className='flex w-full max-w-[440px] flex-col gap-10'>
                    <Logo inverse markClassName='size-11' className='[&>span]:text-[28px]' />

                    <div className="space-y-4 text-white">
                        <h1 className='h1'>Your files, sorted.</h1>
                        <p className='body-1 text-white/85'>
                            Upload, share and find anything in seconds. Collect files from anyone with a drop link, and let StoreIt tag what&apos;s inside.
                        </p>
                    </div>

                    <ProductPreview />
                </div>
            </section>

            <section className='flex flex-1 flex-col items-center bg-white px-4 py-10 sm:px-8 lg:justify-center lg:py-0'>
                <div className='mb-10 lg:hidden'>
                    <Logo markClassName='size-9' className='[&>span]:text-[24px]' />
                </div>
                {children}
            </section>
        </div>
    )
}

export default Layout
