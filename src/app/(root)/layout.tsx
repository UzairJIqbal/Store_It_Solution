import React from 'react'
import Header from '@/components/Header'
import MobileNavigation from '@/components/MobileNavigation'
import Sidebar from '@/components/Sidebar'
import { getCurrentUser } from "@/lib/appwrite/actions/user.action"
import { redirect } from 'next/navigation'
import { Toaster } from "@/components/ui/sonner"
export const dynamic = "force-dynamic"

const Layout = async ({ children }: { children: React.ReactNode }) => {
    const currentuser = await getCurrentUser()
    if (!currentuser) {
        return redirect('/sign-in')
    }
    return (
        <main className='flex h-screen'>
            <Sidebar {...currentuser} />
            <section className='flex h-full flex-1 flex-col'>
                <MobileNavigation {...currentuser} />
                <Header userId={currentuser.$id} accountId={currentuser.accountId} />
                <div className='main-content'>{children}</div>
                <Toaster />
            </section>
        </main>
    )
}

export default Layout;
