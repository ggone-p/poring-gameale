const { existsSync, readdirSync } = require('node:fs')
const { join, resolve } = require('node:path')
const { spawnSync } = require('node:child_process')
const { homedir } = require('node:os')

function findRcedit() {
  const cacheRoot = join(homedir(), 'AppData', 'Local', 'electron-builder', 'Cache', 'winCodeSign')
  if (!existsSync(cacheRoot)) return ''

  const candidates = []
  for (const folder of readdirSync(cacheRoot, { withFileTypes: true })) {
    if (!folder.isDirectory()) continue
    const candidate = join(cacheRoot, folder.name, 'rcedit-x64.exe')
    if (existsSync(candidate)) candidates.push(candidate)
  }

  candidates.sort()
  return candidates.at(-1) || ''
}

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return

  const iconPath = resolve(context.packager.projectDir, 'build', 'icon.ico')
  const exePath = join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`)
  const rcedit = findRcedit()

  if (!rcedit) {
    throw new Error('rcedit-x64.exe was not found in the electron-builder cache.')
  }

  const result = spawnSync(rcedit, [exePath, '--set-icon', iconPath], { encoding: 'utf8' })
  if (result.status !== 0) {
    throw new Error(`Failed to apply Windows icon: ${result.stderr || result.stdout}`)
  }
}
