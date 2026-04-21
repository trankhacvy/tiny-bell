import { check, type Update } from "@tauri-apps/plugin-updater"
import { relaunch } from "@tauri-apps/plugin-process"

export type UpdateStatus =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "up-to-date" }
  | { kind: "available"; version: string; notes: string | null }
  | { kind: "downloading"; percent: number | null }
  | { kind: "installing" }
  | { kind: "error"; message: string }

export type CheckResult =
  | { kind: "up-to-date" }
  | { kind: "available"; update: Update }

export async function checkForUpdate(): Promise<CheckResult> {
  const result = await check()
  if (!result) return { kind: "up-to-date" }
  return { kind: "available", update: result }
}

export async function applyUpdate(
  update: Update,
  onProgress?: (downloaded: number, total: number | null) => void,
): Promise<void> {
  let downloaded = 0
  let total: number | null = null
  await update.downloadAndInstall((event) => {
    switch (event.event) {
      case "Started":
        total = event.data.contentLength ?? null
        downloaded = 0
        onProgress?.(downloaded, total)
        break
      case "Progress":
        downloaded += event.data.chunkLength
        onProgress?.(downloaded, total)
        break
      case "Finished":
        onProgress?.(total ?? downloaded, total)
        break
    }
  })
  await relaunch()
}
