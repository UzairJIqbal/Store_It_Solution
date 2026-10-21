import { Suspense } from 'react'
import type { Metadata } from 'next'
import DropsManager from '@/components/drops/DropsManager'
import { listMyDrops } from '@/lib/appwrite/actions/drops'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Drop links' }

const DropsList = async () => <DropsManager drops={await listMyDrops()} />

const DropsPage = () => (
    <div className='page-container'>
        <section className='w-full'>
            <h1 className='h1'>Drop links</h1>
            <p className='body-1 mt-2 text-light-200'>Collect files from anyone with a link: no account needed, and nobody sees what others sent.</p>
        </section>
        <Suspense fallback={<div className='skeleton h-[180px] w-full rounded-2xl' />}><DropsList /></Suspense>
    </div>
)

export default DropsPage
