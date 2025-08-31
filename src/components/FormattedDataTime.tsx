import { cn, formatDateTime } from '@/lib/utils'
import React from 'react'

const FormattedDataTime = ({ date, className }: { date: string, className?: string }) => {
    return (
        <div className={cn("body-1 text-light-200", className)}>
            {formatDateTime(date)}
        </div>
    )
}

export default FormattedDataTime