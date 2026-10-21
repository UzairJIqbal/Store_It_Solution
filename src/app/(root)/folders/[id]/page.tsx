import React, { cache } from 'react'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import FileBrowser from '@/components/browser/FileBrowser'
import { getFolderContents } from '@/lib/appwrite/actions/folder.action'

// Metadata and the page share one fetch per request
const loadFolder = cache((folderId: string) => getFolderContents({ folderId }))

export const generateMetadata = async ({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> => {
    const contents = await loadFolder((await params).id)
    return { title: contents?.folder?.name ?? 'Folder' }
}

const page = async ({ params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params
    const contents = await loadFolder(id)
    if (!contents) notFound()

    // Keyed by folder so selection and focus reset when moving between folders
    return <FileBrowser key={id} {...contents} />
}

export default page
