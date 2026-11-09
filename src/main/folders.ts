import { stat } from 'node:fs/promises'

export async function isFolder(path: string): Promise<boolean> {
  return stat(path).then(
    (s) => s.isDirectory(),
    () => false
  )
}
