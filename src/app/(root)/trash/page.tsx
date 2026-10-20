import React from 'react'
import TrashView from '@/components/lifecycle/TrashView'
import { getTrash } from '@/lib/appwrite/actions/lifecycle.action'

export const dynamic = 'force-dynamic'

const TrashPage = async () => {
    const { items, days } = await getTrash()
    return <TrashView items={items} days={days} />
}

export default TrashPage
