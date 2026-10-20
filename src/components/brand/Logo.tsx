import React from 'react'
import { cn } from '@/lib/utils'

// The StoreIt mark: a box with its top-right corner folded back in ember, holding a tray with an arrow going in.
// inverse is for indigo backgrounds: a white box with an indigo glyph
export const LogoMark = ({ className, inverse = false }: { className?: string, inverse?: boolean }) => {
    const box = inverse ? '#FFFFFF' : '#5847EB'
    const glyph = inverse ? '#5847EB' : '#FFFFFF'
    return (
        <svg viewBox='0 0 48 48' className={cn('size-10 shrink-0', className)} aria-hidden>
            <path d='M12 3h20l13 13v20a9 9 0 0 1-9 9H12a9 9 0 0 1-9-9V12a9 9 0 0 1 9-9Z' fill={box} />
            <path d='M32 3v8a5 5 0 0 0 5 5h8L32 3Z' fill='#FF7A59' />
            <path d='M14 27v4.5a2.5 2.5 0 0 0 2.5 2.5h15a2.5 2.5 0 0 0 2.5-2.5V27' fill='none' stroke={glyph} strokeWidth='3.2'
                strokeLinecap='round' strokeLinejoin='round' />
            <path d='M24 14v13m-5-5 5 5 5-5' fill='none' stroke={glyph} strokeWidth='3.2' strokeLinecap='round' strokeLinejoin='round' />
        </svg>
    )
}

// Mark plus wordmark: "Store" in ink and "It" in indigo, set in the display face
const Logo = ({ className, markClassName, compact = false, inverse = false }: {
    className?: string,
    markClassName?: string,
    // Hides the wordmark below lg, for the narrow sidebar
    compact?: boolean,
    inverse?: boolean,
}) => (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
        <LogoMark className={markClassName} inverse={inverse} />
        <span aria-hidden className={cn('font-display text-[26px] font-bold leading-none tracking-[-0.03em]',
            inverse ? 'text-white' : 'text-dark-200', compact && 'hidden lg:inline')}>
            Store<span className={inverse ? 'text-[#FFD3C6]' : 'text-brand'}>It</span>
        </span>
        <span className='sr-only'>StoreIt</span>
    </span>
)

export default Logo
