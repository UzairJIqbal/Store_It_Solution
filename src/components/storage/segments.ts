import type { StorageSegment } from '@/lib/appwrite/actions/discover'

// Bar colours per kind of usage; trash and old versions use muted tones so "real" files stand out
export const SEGMENT_COLOR: Record<StorageSegment['key'], string> = {
    document: '#5847EB',
    image: '#4FA8F7',
    video: '#FF7A59',
    audio: '#2BC4A0',
    other: '#D58BF0',
    versions: '#F5B83D',
    trash: '#8A8AA8',
}
