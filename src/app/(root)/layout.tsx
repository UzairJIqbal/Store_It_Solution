import React from 'react'
import Header from '@/components/Header'
import MobileNavigation from '@/components/MobileNavigation'
import Sidebar from '@/components/Sidebar'
import { getCurrentUser } from "@/lib/appwrite/actions/user.action"
import { redirect } from 'next/navigation'
import { Toaster } from "@/components/ui/sonner"
import LifecycleProvider from "@/components/lifecycle/LifecycleProvider"
import { getTotalSpaceUsed } from "@/lib/appwrite/actions/file.action"
import CommandPalette from "@/components/palette/CommandPalette"
import { getFolderTree } from "@/lib/appwrite/actions/folder.action"
export const dynamic = "force-dynamic"

const Layout = async ({ children }: { children: React.ReactNode }) => {
    const currentuser = await getCurrentUser()
    if (!currentuser) {
        return redirect('/sign-in')
    }
    // The sidebar tree comes from the layout, so router.refresh() after a folder change updates it too
    const [totalSpace, folders] = await Promise.all([getTotalSpaceUsed(), getFolderTree().catch(() => [])])
    return (
        <main className='flex h-screen'>
            <Sidebar {...currentuser} storage={totalSpace ? { used: totalSpace.used, all: totalSpace.all } : undefined} folders={folders} />
            <section className='flex h-full flex-1 flex-col'>
                <MobileNavigation {...currentuser} />
                {/* The header's search box opens previews, so it sits inside the provider */}
                <LifecycleProvider>
                    <Header userId={currentuser.$id} accountId={currentuser.accountId} />
                    <div className='main-content'>{children}</div>
                    <CommandPalette />
                </LifecycleProvider>
                <Toaster />
            </section>
        </main>
    )
}

export default Layout;
