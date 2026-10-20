import Link from 'next/link'
import { cn, convertFileSize, formatUsagePercent, getUsageLevel } from '@/lib/utils'

interface Props {
    used: number,
    total: number
}

const fillColor = {
    normal: 'bg-brand',
    warning: 'bg-orange',
    critical: 'bg-error',
}

// Compact sidebar meter in the style of Google Drive's "X of Y used" bar,
// exposed to assistive tech as a meter rather than as decorative markup.
const StorageMeter = ({ used, total }: Props) => {
    const percent = total > 0 ? Math.min((used / total) * 100, 100) : 0
    const level = getUsageLevel(percent)
    const label = `${convertFileSize(used)} of ${convertFileSize(total)} used`

    return (
        <Link href="/storage" className='storage-meter'>
            <div
                role='meter'
                aria-label='Storage used'
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(percent)}
                aria-valuetext={`${label} (${formatUsagePercent(percent)})`}
                className='storage-meter-track'
            >
                <div
                    className={cn('storage-meter-fill', fillColor[level])}
                    // Keep a visible sliver for tiny non-zero usage
                    style={{ width: `${percent > 0 ? Math.max(percent, 1) : 0}%` }}
                />
            </div>
            <p className={cn('caption', level === 'critical' ? 'text-error' : 'text-light-200')}>
                {label}
            </p>
        </Link>
    )
}

export default StorageMeter
