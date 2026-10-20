// Creates (or updates) and deploys the daily lifecycle cleanup Function from functions/lifecycle-cleanup.
// Run with: bun scripts/deploy-cleanup.ts   (after setup-lifecycle.ts)
// No secret goes into the Function: it uses its own dynamic API key, limited to the scopes below.
import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { AppwriteException, Client, Functions, Runtime } from "node-appwrite"
import { InputFile } from "node-appwrite/file"

const endpoint = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT
const projectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID
const key = process.env.APPWRITE_KEY
const variables: Record<string, string | undefined> = {
    STOREIT_DATABASE_ID: process.env.NEXT_PUBLIC_APPWRITE_DATABASE,
    STOREIT_BUCKET_ID: process.env.NEXT_PUBLIC_APPWRITE_BUCKET,
    STOREIT_FILES_COLLECTION: process.env.NEXT_PUBLIC_APPWRITE_FILES_COLLECTION,
    STOREIT_FOLDERS_COLLECTION: process.env.NEXT_PUBLIC_APPWRITE_FOLDERS_COLLECTION,
    STOREIT_SHARES_COLLECTION: process.env.NEXT_PUBLIC_APPWRITE_SHARES_COLLECTION ?? "shares",
    STOREIT_FILE_STATES_COLLECTION: process.env.NEXT_PUBLIC_APPWRITE_FILE_STATES_COLLECTION ?? "fileStates",
    STOREIT_FILE_VERSIONS_COLLECTION: process.env.NEXT_PUBLIC_APPWRITE_FILE_VERSIONS_COLLECTION ?? "fileVersions",
    STOREIT_ACTIVITY_COLLECTION: process.env.NEXT_PUBLIC_APPWRITE_ACTIVITY_COLLECTION ?? "activity",
}

if (!endpoint || !projectId || !key || Object.values(variables).some((v) => !v)) {
    console.error("Missing Appwrite env vars (endpoint, project, database, bucket, files/folders collections, APPWRITE_KEY)")
    process.exit(1)
}

const FUNCTION_ID = "lifecycle-cleanup"
const settings = {
    name: "Lifecycle cleanup",
    runtime: Runtime.Node22,
    // Nobody can run it by request; only the schedule
    execute: [] as string[],
    events: [] as string[],
    schedule: "0 3 * * *",
    timeout: 300,
    entrypoint: "src/main.js",
    commands: "npm install",
    scopes: ["documents.read", "documents.write", "files.read", "files.write"],
}

const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(key)
const functions = new Functions(client)

const fail = (label: string, error: unknown): never => {
    const detail = error instanceof AppwriteException ? `${error.code} ${error.type}: ${error.message}` : String(error)
    console.error(`${label} failed: ${detail}`)
    process.exit(1)
}

const s = settings
try {
    await functions.get(FUNCTION_ID)
    await functions.update(FUNCTION_ID, s.name, s.runtime, s.execute, s.events, s.schedule, s.timeout, true, true, s.entrypoint, s.commands, s.scopes)
    console.log(`updated  function ${FUNCTION_ID}`)
} catch (error) {
    if (!(error instanceof AppwriteException && error.code === 404)) fail("Reading the function", error)
    await functions.create(FUNCTION_ID, s.name, s.runtime, s.execute, s.events, s.schedule, s.timeout, true, true, s.entrypoint, s.commands, s.scopes)
        .catch((e) => fail("Creating the function", e))
    console.log(`created  function ${FUNCTION_ID}`)
}

const existing = await functions.listVariables(FUNCTION_ID).catch((e) => fail("Listing variables", e))
for (const [name, value] of Object.entries(variables)) {
    const current = existing.variables.find((v) => v.key === name)
    if (current) await functions.updateVariable(FUNCTION_ID, current.$id, name, value!, false).catch((e) => fail(`Updating ${name}`, e))
    else await functions.createVariable(FUNCTION_ID, name, value!, false).catch((e) => fail(`Creating ${name}`, e))
}
console.log(`set      ${Object.keys(variables).length} variables`)

// Package only the source and package.json; node_modules are installed by the build
const source = resolve(new URL("../functions/lifecycle-cleanup", import.meta.url).pathname)
const work = mkdtempSync(join(tmpdir(), "storeit-cleanup-"))
const archive = join(work, "code.tar.gz")
try {
    execFileSync("tar", ["-czf", archive, "-C", source, "package.json", "src"])
    const deployment = await functions.createDeployment(FUNCTION_ID, InputFile.fromPath(archive, "code.tar.gz"), true, s.entrypoint, s.commands)
        .catch((e) => fail("Uploading the deployment", e))
    console.log(`uploaded deployment ${deployment.$id}, building...`)

    for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 5000))
        const current = await functions.getDeployment(FUNCTION_ID, deployment.$id)
        if (current.status === "ready") {
            console.log(`ready    deployment ${deployment.$id} is active; runs daily at 03:00 UTC`)
            process.exit(0)
        }
        if (current.status === "failed") {
            console.error(`Build failed:\n${current.buildLogs}`)
            process.exit(1)
        }
    }
    console.error("Build is still running after 5 minutes; check the Appwrite console")
    process.exit(1)
} finally {
    rmSync(work, { recursive: true, force: true })
}
