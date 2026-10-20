'use client'
import { createContext, useContext } from 'react'
import { createFolder, getFolderTree, moveItems, renameFolder } from '@/lib/appwrite/actions/folder.action'
import { renameFile } from '@/lib/appwrite/actions/file.action'
import { restoreItems, toggleStar, trashItems } from '@/lib/appwrite/actions/lifecycle.action'

// The browser reaches the backend only through this object, so a different data source can be swapped in
export const defaultBrowserActions = {
    createFolder,
    renameFolder,
    moveItems,
    trashItems,
    restoreItems,
    toggleStar,
    getFolderTree,
    renameFile,
    folderHref: (folderId: string | null) => (folderId ? `/folders/${folderId}` : '/files'),
}

export type BrowserActions = typeof defaultBrowserActions

export const BrowserActionsContext = createContext<BrowserActions>(defaultBrowserActions)

export const useBrowserActions = () => useContext(BrowserActionsContext)
