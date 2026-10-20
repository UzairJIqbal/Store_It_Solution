import React from 'react'
import { notFound } from 'next/navigation'
import FileBrowser from '@/components/browser/FileBrowser'
import { getFolderContents } from '@/lib/appwrite/actions/folder.action'

const page = async ({ params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params
    const contents = await getFolderContents({ folderId: id })
    if (!contents) notFound()

    // Keyed by folder so selection and focus reset when moving between folders
    return <FileBrowser key={id} {...contents} />
}

export default page
