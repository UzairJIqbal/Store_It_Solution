import { ListSkeleton, Skeleton } from '@/components/ui/skeleton'

const StorageSkeleton = () => (
    <div role='status' aria-label='Loading storage' className='flex w-full flex-col gap-8'>
        <div className='storage-card flex flex-col gap-4'>
            <Skeleton className='h-10 w-64' />
            <Skeleton className='h-4 w-full rounded-full' />
            <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-4'>
                {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className='h-10' />)}
            </div>
        </div>
        <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-4'>
            {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className='h-36 rounded-[18px]' />)}
        </div>
        <ListSkeleton rows={6} columns={3} label='Loading largest files' />
    </div>
)

export default StorageSkeleton
