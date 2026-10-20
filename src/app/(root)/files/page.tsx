import React from 'react'
import { notFound } from 'next/navigation'
import FileBrowser from '@/components/browser/FileBrowser'
import { getFolderContents } from '@/lib/appwrite/actions/folder.action'

const page = async () => {
    const contents = await getFolderContents({ folderId: null })
    if (!contents) notFound()

    return <FileBrowser key='root' {...contents} />
}

export default page
