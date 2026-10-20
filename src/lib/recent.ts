import type { RecentReason } from '@/lib/appwrite/actions/lifecycle.action'

// Why a file shows up in Recent and on Home ("Reason suggested")
export const REASON_LABEL: Record<RecentReason, string> = {
    opened: 'You opened',
    uploaded: 'You uploaded',
    modified: 'You modified',
    shared: 'You shared',
}
