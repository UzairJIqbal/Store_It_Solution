import { Clock, Cloud, FolderClosed, House, Inbox, LucideIcon, Star, Trash2, Users } from 'lucide-react'

export type NavLink = { name: string, url: string, icon: LucideIcon }

// Places first, then the inbound tool, then housekeeping. File types live in search's Type filter.
export const navGroups: { items: NavLink[] }[] = [
    {
        items: [
            { name: 'Home', url: '/', icon: House },
            { name: 'My Files', url: '/files', icon: FolderClosed },
            { name: 'Shared with me', url: '/shared', icon: Users },
            { name: 'Recent', url: '/recent', icon: Clock },
            { name: 'Starred', url: '/starred', icon: Star },
        ],
    },
    {
        items: [{ name: 'Drop links', url: '/drops', icon: Inbox }],
    },
    {
        items: [
            { name: 'Trash', url: '/trash', icon: Trash2 },
            { name: 'Storage', url: '/storage', icon: Cloud },
        ],
    },
]

export const navLinks = navGroups.flatMap((g) => g.items)

// Shortcuts the command palette offers for the old category pages
export const typeShortcuts = [
    { name: 'Documents', url: '/search?type=document' },
    { name: 'Images', url: '/search?type=image' },
    { name: 'Videos and audio', url: '/search?type=video,audio' },
    { name: 'Other files', url: '/search?type=other' },
]

export const initialsOf = (fullName: string, email = '') => {
    const parts = fullName.trim().split(/\s+/).filter(Boolean)
    const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] ?? email).slice(0, 2)
    return letters.toUpperCase()
}
