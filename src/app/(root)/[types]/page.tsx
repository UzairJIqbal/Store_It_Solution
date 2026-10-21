import { notFound, redirect } from 'next/navigation'
import { SearchParamProps } from '../../../../types'

// The old category pages live on as the Type filter in search, so old links still land somewhere useful
const TYPE_FILTER: Record<string, string> = {
    documents: 'document',
    images: 'image',
    media: 'video,audio',
    others: 'other',
}

const page = async ({ params }: SearchParamProps) => {
    const type = TYPE_FILTER[((await params)?.types as string) ?? '']
    if (!type) notFound()
    redirect(`/search?type=${type}`)
}

export default page
