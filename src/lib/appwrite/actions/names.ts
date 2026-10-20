// "report.pdf" → "report (1).pdf": the first numbered name not already taken in a folder

export const splitName = (name: string) => {
    const dot = name.lastIndexOf(".")
    return dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""]
}

export const nextFreeName = (name: string, taken: Set<string>) => {
    const [base, ext] = splitName(name)
    for (let n = 1; ; n++) {
        const candidate = `${base} (${n})${ext}`
        if (!taken.has(candidate)) return candidate
    }
}
