import Image from 'next/image'
import React from 'react'
import Logo from '@/components/brand/Logo'

const Layout = ({ children }: { children: React.ReactNode }) => {
    return (
        <div className='flex min-h-screen'>
            <section className='auth-brand-panel'>
                <div className='relative z-10 flex max-h-[800px] max-w-[430px] flex-col justify-center space-y-12'>
                    <Logo inverse markClassName='size-12' className='[&>span]:text-[30px]' />

                    <div className="space-y-5 text-white">
                        <h1 className='h1'>Your files, sorted.</h1>
                        <p className='body-1 text-white/80'>
                            Upload, share and find anything in seconds. Collect files from anyone with a drop link, and let StoreIt tag what&apos;s inside.
                        </p>
                    </div>

                    <Image
                        src="/assets/images/files.png"
                        alt=''
                        width={342}
                        height={342}
                        className='transition-transform duration-500 hover:-rotate-2 hover:scale-105'
                    />
                </div>
            </section>

            <section className='flex flex-1 flex-col items-center bg-white p-4 py-10 lg:justify-center lg:p-10 lg:py-0'>
            {children}
            </section>
        </div>
    )
}

export default Layout
