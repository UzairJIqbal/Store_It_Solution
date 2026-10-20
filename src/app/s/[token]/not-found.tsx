import Link from 'next/link'
import Logo from '@/components/brand/Logo'

const LinkNotFound = () => (
    <main className='flex min-h-screen flex-col items-center justify-center gap-6 bg-light-400 px-4 text-center'>
        <Logo />
        <h1 className='h2 text-light-100'>This link doesn&apos;t work</h1>
        <p className='body-1 max-w-[420px] text-light-200'>
            The owner may have turned the link off, or it was copied incorrectly. Ask them to share the file with you again.
        </p>
        <Link href='/sign-in' className='button rounded-full bg-brand px-6 py-3 text-white'>Sign in to StoreIt</Link>
    </main>
)

export default LinkNotFound
