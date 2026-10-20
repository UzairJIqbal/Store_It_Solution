import StorageSkeleton from '@/components/storage/StorageSkeleton'
import { Skeleton } from '@/components/ui/skeleton'

export default function Loading() {
    return (
        <div className='page-container'>
            <section className='flex w-full flex-col gap-3'>
                <Skeleton className='h-9 w-40' />
                <Skeleton className='h-4 w-96 max-w-full' />
            </section>
            <StorageSkeleton />
        </div>
    )
}
