import React from 'react'
import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'

type props = {
    icon: LucideIcon,
    title: string,
    children: React.ReactNode,
    action?: { href: string, label: string },
}

// A heading, one sentence that teaches how the page fills up, and at most one way forward
const EmptyState = ({ icon: Icon, title, children, action }: props) => (
    <div className='empty-state'>
        <span className='empty-state-art'><Icon className='size-10' aria-hidden /></span>
        <h2 className='h3 text-light-100'>{title}</h2>
        <p className='body-2 max-w-[420px] text-center text-light-200'>{children}</p>
        {action && <Link href={action.href} className='search-text-btn'>{action.label}</Link>}
    </div>
)

export default EmptyState
