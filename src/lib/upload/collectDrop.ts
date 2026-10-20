// Turns a drop (files and/or folders) into a flat list of files with their folder path inside the drop

export interface DroppedFile {
    file: File,
    // "" for a file dropped on its own, otherwise its folder path ("photos/2024")
    dir: string,
}

export interface DropContents {
    files: DroppedFile[],
    // Every folder in the drop, so empty folders are recreated too
    dirs: string[],
    // Top-level folder names, in drop order
    roots: string[],
}

// Operating-system clutter that nobody means to upload
const IGNORED = new Set(['.DS_Store', 'Thumbs.db', 'desktop.ini'])

export const isIgnoredFile = (name: string) => IGNORED.has(name)

const readAllEntries = async (dir: FileSystemDirectoryEntry) => {
    const reader = dir.createReader()
    const entries: FileSystemEntry[] = []
    // readEntries returns at most ~100 entries per call, so keep reading until it returns none
    while (true) {
        const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject))
        if (batch.length === 0) return entries
        entries.push(...batch)
    }
}

const fileOf = (entry: FileSystemFileEntry) =>
    new Promise<File>((resolve, reject) => entry.file(resolve, reject))

const walk = async (entry: FileSystemEntry, parent: string, out: DropContents) => {
    if (entry.isFile) {
        if (isIgnoredFile(entry.name)) return
        out.files.push({ file: await fileOf(entry as FileSystemFileEntry), dir: parent })
    } else if (entry.isDirectory) {
        const dir = parent ? `${parent}/${entry.name}` : entry.name
        out.dirs.push(dir)
        for (const child of await readAllEntries(entry as FileSystemDirectoryEntry)) await walk(child, dir, out)
    }
}

// Must be called synchronously inside the drop handler: DataTransfer items are emptied once the event ends
export const readDrop = (dataTransfer: DataTransfer): Promise<DropContents> => {
    const items = Array.from(dataTransfer.items).filter((i) => i.kind === 'file')
    const entries = items.map((i) => i.webkitGetAsEntry?.() ?? null)
    const plainFiles = items.map((i) => i.getAsFile())

    return (async () => {
        const out: DropContents = { files: [], dirs: [], roots: [] }
        for (let i = 0; i < items.length; i++) {
            const entry = entries[i]
            if (entry?.isDirectory) {
                out.roots.push(entry.name)
                await walk(entry, '', out)
            } else {
                const file = plainFiles[i]
                if (file && !isIgnoredFile(file.name)) out.files.push({ file, dir: '' })
            }
        }
        return out
    })()
}
