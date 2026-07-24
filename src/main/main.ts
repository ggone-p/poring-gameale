import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, nativeImage, screen, shell, Tray } from 'electron'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import electronUpdater from 'electron-updater'
import { extname, join, dirname, basename } from 'node:path'
import { copyFileSync, createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createHash } from 'node:crypto'
import { constants as osConstants, setPriority } from 'node:os'
import sharp from 'sharp'
import type {
  AppConfig,
  AssetFile,
  BackgroundRemovalInstallRequest,
  BackgroundRemovalProgress,
  BackgroundRemovalResult,
  BackgroundRemovalRuntimeStatus,
  BitableField,
  BrowserImportTarget,
  CompressionOptions,
  CompressionPreviewRequest,
  CompressionPreviewResult,
  CompressionRunRequest,
  CompressionRunResult,
  FeishuCredentials,
  FeishuRecord,
  ImageItem,
  OverlaySettings,
  OverlayState,
  SchemaSnapshot,
  TableInfo,
  UploadRequest,
  UploadResult
} from '../shared/types'
import { defaultCompression, defaultFieldMapping, defaultOverlays, defaultSelections, defaultWorkflow } from '../shared/types'

const { autoUpdater } = electronUpdater
const DEFAULT_APP_ID = 'cli_a80a7c95e83bd01c'
const DEFAULT_APP_TOKEN = 'FBGWbqE7YaWtlBsFr5rc8L4vnPh'
const DEFAULT_TABLE_ID = 'tblBsneYhqCtYPBc'
const DEFAULT_UPDATE_URL = 'https://github.com/ggone-p/poring-gameale/releases/latest/download/'
const DEFAULT_LOGO_DIR = '\\\\nas-publish.gastudio.cn\\发行运营中心\\软件\\设计软件\\Poring图片助手\\LOGO标志'
const DEFAULT_SLOGAN_DIR = '\\\\nas-publish.gastudio.cn\\发行运营中心\\软件\\设计软件\\Poring图片助手\\标语slogan'
const DEFAULT_ICON_DIR = '\\\\nas-publish.gastudio.cn\\发行运营中心\\软件\\设计软件\\Poring图片助手\\应用商店图标'
const APP_DISPLAY_NAME = '波利AI图助手'
const DONE_PROGRESS_VALUE = '\u5df2\u5b8c\u6210all'
const DONE_PROGRESS_FALLBACK_VALUES = [DONE_PROGRESS_VALUE, '\u5df2\u5b8c\u6210']
const LOCAL_IMPORT_PORT = 17367
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp'])
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.m4v', '.webm'])
const EXPANDED_WIDTH = 1024
const EXPANDED_HEIGHT = 768
const INNER_WIDTH = 1024
const INNER_HEIGHT = 768
const TOOLBOX_WIDTH = 900
const TOOLBOX_HEIGHT = 600
const COMPRESSION_WIDTH = 1280
const COMPRESSION_HEIGHT = 1024
const BACKGROUND_REMOVAL_WIDTH = 1280
const BACKGROUND_REMOVAL_HEIGHT = 1024
const COLLAPSED_WIDTH = 118
const COLLAPSED_HEIGHT = 118
const SOFTWARE_DESIGNER = '方攀'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let tenantTokenCache: { token: string; expiresAt: number } | null = null
let isQuitting = false
let mediaServer: Server | null = null
let mediaServerPort = 0
let updateStatus = '尚未检查更新'
let fallbackInstallerPath = ''
let lastCollapsedPosition: { x: number; y: number } | null = null
let suppressMoveSave = false
let backgroundRemovalInstalling = false
let backgroundRemovalInstallCancelled = false
let backgroundRemovalInstallChild: ChildProcessWithoutNullStreams | null = null

let updateState = {
  phase: 'idle',
  status: updateStatus,
  percent: 0
}

function trayIconPath(): string {
  if (app.isPackaged) return join(process.resourcesPath, 'tray-icon.png')
  return join(app.getAppPath(), 'src/main/assets/tray-icon.png')
}

function applyLoginItemSettings(config: AppConfig): void {
  app.setLoginItemSettings({
    openAtLogin: config.workflow.launchAtLogin,
    path: process.execPath,
    args: app.isPackaged ? [] : [app.getAppPath()]
  })
}

function publishUpdateState(phase: string, status: string, percent = 0): void {
  updateStatus = status
  updateState = { phase, status, percent }
  mainWindow?.webContents.send('updates:status', updateState)
}

function configPath(): string {
  return join(app.getPath('userData'), 'config.json')
}

function defaultConfig(): AppConfig {
  return {
    feishu: {
      appId: DEFAULT_APP_ID,
      appSecret: '',
      appToken: DEFAULT_APP_TOKEN,
      tableId: DEFAULT_TABLE_ID
    },
    fieldMapping: defaultFieldMapping,
    assetLibrary: {
      logoDir: DEFAULT_LOGO_DIR,
      sloganDir: DEFAULT_SLOGAN_DIR,
      iconDir: DEFAULT_ICON_DIR
    },
    workflow: defaultWorkflow,
    compression: defaultCompression,
    backgroundRemoval: {
      installDir: ''
    },
    overlays: defaultOverlays,
    selections: {
      ...defaultSelections,
      completionDate: todayString()
    },
    window: {
      collapsed: true
    }
  }
}

function readConfig(): AppConfig {
  const fallback = defaultConfig()
  try {
    const raw = readFileSync(configPath(), 'utf8')
    const parsed = JSON.parse(raw) as Partial<AppConfig>
    const merged = {
      ...fallback,
      ...parsed,
      feishu: { ...fallback.feishu, ...parsed.feishu },
      fieldMapping: { ...fallback.fieldMapping, ...parsed.fieldMapping },
      assetLibrary: { ...fallback.assetLibrary, ...parsed.assetLibrary },
      workflow: { ...fallback.workflow, ...parsed.workflow },
      backgroundRemoval: { ...fallback.backgroundRemoval, ...parsed.backgroundRemoval },
      compression: {
        ...fallback.compression,
        ...parsed.compression,
        defaultOptions: {
          ...fallback.compression.defaultOptions,
          ...parsed.compression?.defaultOptions
        },
        lastUsedOptions: {
          ...fallback.compression.lastUsedOptions,
          ...parsed.compression?.lastUsedOptions
        }
      },
      overlays: {
        logo: { ...fallback.overlays.logo, ...parsed.overlays?.logo },
        slogan: { ...fallback.overlays.slogan, ...parsed.overlays?.slogan },
        icon: { ...fallback.overlays.icon, ...parsed.overlays?.icon }
      },
      selections: { ...fallback.selections, ...parsed.selections },
      window: { ...fallback.window, ...parsed.window }
    }
    return applyBuiltInDefaults(merged)
  } catch {
    return fallback
  }
}

function applyBuiltInDefaults(config: AppConfig): AppConfig {
  return {
    ...config,
    feishu: {
      ...config.feishu,
      appId: config.feishu.appId || DEFAULT_APP_ID,
      appToken: config.feishu.appToken || DEFAULT_APP_TOKEN,
      tableId: config.feishu.tableId || DEFAULT_TABLE_ID
    },
    workflow: {
      ...config.workflow,
      updateUrl: config.workflow.updateUrl || DEFAULT_UPDATE_URL
    },
    compression: {
      ...defaultCompression,
      ...config.compression,
      defaultOptions: {
        ...defaultCompression.defaultOptions,
        ...config.compression?.defaultOptions
      },
      lastUsedOptions: {
        ...defaultCompression.lastUsedOptions,
        ...config.compression?.lastUsedOptions
      }
    },
    assetLibrary: {
      ...config.assetLibrary,
      logoDir: config.assetLibrary.logoDir || DEFAULT_LOGO_DIR,
      sloganDir: config.assetLibrary.sloganDir || DEFAULT_SLOGAN_DIR,
      iconDir: config.assetLibrary.iconDir || DEFAULT_ICON_DIR
    }
  }
}

function saveConfig(patch: Partial<AppConfig>): AppConfig {
  const current = readConfig()
  const next: AppConfig = {
    ...current,
    ...patch,
    feishu: { ...current.feishu, ...patch.feishu },
    fieldMapping: { ...current.fieldMapping, ...patch.fieldMapping },
    assetLibrary: { ...current.assetLibrary, ...patch.assetLibrary },
    workflow: { ...current.workflow, ...patch.workflow },
    backgroundRemoval: { ...current.backgroundRemoval, ...patch.backgroundRemoval },
    compression: {
      ...current.compression,
      ...patch.compression,
      defaultOptions: {
        ...current.compression.defaultOptions,
        ...patch.compression?.defaultOptions
      },
      lastUsedOptions: {
        ...current.compression.lastUsedOptions,
        ...patch.compression?.lastUsedOptions
      }
    },
    overlays: {
      logo: { ...current.overlays.logo, ...patch.overlays?.logo },
      slogan: { ...current.overlays.slogan, ...patch.overlays?.slogan },
      icon: { ...current.overlays.icon, ...patch.overlays?.icon }
    },
    selections: { ...current.selections, ...patch.selections },
    window: { ...current.window, ...patch.window }
  }
  mkdirSync(dirname(configPath()), { recursive: true })
  writeFileSync(configPath(), JSON.stringify(next, null, 2), 'utf8')
  if (app.isReady()) applyLoginItemSettings(next)
  return next
}

function configureAutoUpdater(config = readConfig()): void {
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  if (config.workflow.updateUrl) {
    autoUpdater.setFeedURL({
      provider: 'generic',
      url: config.workflow.updateUrl
    })
  }
}

function todayString(): string {
  const d = new Date()
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function mimeForPath(filePath: string): string {
  const ext = extname(filePath).toLowerCase()
  if (ext === '.mp4' || ext === '.m4v') return 'video/mp4'
  if (ext === '.mov') return 'video/quicktime'
  if (ext === '.webm') return 'video/webm'
  if (ext === '.png') return 'image/png'
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  if (ext === '.webp') return 'image/webp'
  return 'application/octet-stream'
}

function extensionForMime(mime: string): string {
  const normalized = mime.toLowerCase().split(';')[0].trim()
  if (normalized === 'image/png') return '.png'
  if (normalized === 'image/jpeg' || normalized === 'image/jpg') return '.jpg'
  if (normalized === 'image/webp') return '.webp'
  return ''
}

function writeJsonResponse(response: ServerResponse, status: number, data: unknown): void {
  response.writeHead(status, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8'
  })
  response.end(JSON.stringify(data))
}

function readRequestBody(request: IncomingMessage, limit = 80 * 1024 * 1024): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    request.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > limit) {
        reject(new Error('导入图片太大，请先另存后拖入软件。'))
        request.destroy()
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => resolve(Buffer.concat(chunks)))
    request.on('error', reject)
  })
}

function safeImportedFileName(fileName: string, mime: string, sourceUrl = ''): string {
  const urlName = (() => {
    try {
      return basename(decodeURIComponent(new URL(sourceUrl).pathname))
    } catch {
      return ''
    }
  })()
  const rawName = fileName || urlName || `browser-image-${Date.now()}`
  const ext = extname(rawName) || extensionForMime(mime) || '.png'
  const base = sanitizeFileBaseName(rawName.replace(/\.[^.]+$/, '')) || `browser-image-${Date.now()}`
  return `${base}${ext}`
}

async function importBrowserImage(payload: { url?: string; dataUrl?: string; fileName?: string }): Promise<ImageItem> {
  let buffer: Buffer
  let mime = ''
  const source = payload.dataUrl || payload.url || ''
  if (!source) throw new Error('没有收到图片地址。')

  if (payload.dataUrl || source.startsWith('data:')) {
    const match = source.match(/^data:([^;,]+)[^,]*,(.+)$/)
    if (!match) throw new Error('图片数据无效。')
    mime = match[1]
    buffer = Buffer.from(match[2], 'base64')
  } else {
    const response = await fetch(source)
    if (!response.ok) throw new Error(`下载网页图片失败：${response.status}`)
    mime = response.headers.get('content-type') || ''
    buffer = Buffer.from(await response.arrayBuffer())
  }

  if (!mime.startsWith('image/')) {
    const detected = await sharp(buffer).metadata().catch(() => null)
    if (!detected?.format) throw new Error('收到的内容不是图片。')
    mime = `image/${detected.format === 'jpeg' ? 'jpeg' : detected.format}`
  }

  const importDir = join(app.getPath('userData'), 'browser-imports')
  mkdirSync(importDir, { recursive: true })
  const fileName = safeImportedFileName(payload.fileName || '', mime, payload.url)
  const filePath = uniquePath(join(importDir, fileName))
  writeFileSync(filePath, buffer)
  return imageToItem(filePath)
}

function deliverImportedImages(items: ImageItem[], target: BrowserImportTarget = 'upload'): void {
  if (!items.length || !mainWindow) return
  if (target === 'background-removal') setWindowMode('background-removal')
  else expandWindow()
  mainWindow.webContents.send('files:browser-imported', { items, target })
}

function startMediaServer(): Promise<void> {
  if (mediaServer && mediaServerPort) return Promise.resolve()
  mediaServer = createServer(async (request, response) => {
    const requestUrl = new URL(request.url || '/', 'http://127.0.0.1')
    if (request.method === 'OPTIONS') {
      response.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      })
      response.end()
      return
    }
    if (requestUrl.pathname === '/health') {
      writeJsonResponse(response, 200, { ok: true, app: APP_DISPLAY_NAME, port: LOCAL_IMPORT_PORT })
      return
    }
    if (requestUrl.pathname === '/import-image' && request.method === 'POST') {
      try {
        const body = await readRequestBody(request)
        const json = JSON.parse(body.toString('utf8')) as {
          url?: string
          dataUrl?: string
          fileName?: string
          target?: BrowserImportTarget
          images?: Array<{ url?: string; dataUrl?: string; fileName?: string }>
        }
        const target: BrowserImportTarget = json.target === 'background-removal' ? 'background-removal' : 'upload'
        const payloads = Array.isArray(json.images) ? json.images : [json]
        const items: ImageItem[] = []
        for (const payload of payloads) items.push(await importBrowserImage(payload))
        deliverImportedImages(items, target)
        writeJsonResponse(response, 200, { ok: true, count: items.length, target })
      } catch (error) {
        writeJsonResponse(response, 400, { ok: false, error: error instanceof Error ? error.message : String(error) })
      }
      return
    }
    if (requestUrl.pathname !== '/media') {
      response.writeHead(404)
      response.end()
      return
    }

    const filePath = requestUrl.searchParams.get('path') || ''
    const ext = extname(filePath).toLowerCase()
    if (!existsSync(filePath) || !VIDEO_EXTENSIONS.has(ext)) {
      response.writeHead(404, { 'Access-Control-Allow-Origin': '*' })
      response.end()
      return
    }

    const { size } = statSync(filePath)
    const range = request.headers.range
    const baseHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store',
      'Content-Type': mimeForPath(filePath)
    }

    if (range) {
      const match = /bytes=(\d*)-(\d*)/.exec(range)
      const start = match?.[1] ? Number(match[1]) : 0
      const end = match?.[2] ? Number(match[2]) : size - 1
      if (!match || start >= size || end >= size || start > end) {
        response.writeHead(416, { ...baseHeaders, 'Content-Range': `bytes */${size}` })
        response.end()
        return
      }
      response.writeHead(206, {
        ...baseHeaders,
        'Content-Length': String(end - start + 1),
        'Content-Range': `bytes ${start}-${end}/${size}`
      })
      if (request.method === 'HEAD') {
        response.end()
        return
      }
      createReadStream(filePath, { start, end }).pipe(response)
      return
    }

    response.writeHead(200, { ...baseHeaders, 'Content-Length': String(size) })
    if (request.method === 'HEAD') {
      response.end()
      return
    }
    createReadStream(filePath).pipe(response)
  })

  return new Promise((resolve, reject) => {
    mediaServer?.once('error', reject)
    mediaServer?.listen(LOCAL_IMPORT_PORT, '127.0.0.1', () => {
      const address = mediaServer?.address()
      mediaServerPort = typeof address === 'object' && address ? address.port : 0
      resolve()
    })
  })
}

function mediaUrlForPath(filePath: string): string {
  if (!mediaServerPort) throw new Error('本地视频服务还没有启动，请重启软件后再试。')
  return `http://127.0.0.1:${mediaServerPort}/media?path=${encodeURIComponent(filePath)}&v=${statSync(filePath).mtimeMs}`
}

function setWindowBoundsSafely(bounds: Electron.Rectangle, animate = true): void {
  if (!mainWindow) return
  suppressMoveSave = true
  mainWindow.setBounds(bounds, animate)
  setTimeout(() => {
    suppressMoveSave = false
  }, 160)
}

function createWindow(): void {
  const config = readConfig()
  mainWindow = new BrowserWindow({
    width: config.window.collapsed ? 118 : EXPANDED_WIDTH,
    height: config.window.collapsed ? 118 : EXPANDED_HEIGHT,
    x: config.window.x,
    y: config.window.y,
    minWidth: 112,
    minHeight: 112,
    frame: false,
    resizable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    title: APP_DISPLAY_NAME,
    icon: trayIconPath(),
    transparent: true,
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: join(__dirname, '../preload/preload.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.webContents.once('did-finish-load', () => {
    mainWindow?.webContents.send('updates:status', updateState)
  })

  mainWindow.on('moved', () => {
    if (!mainWindow) return
    if (suppressMoveSave) return
    const currentConfig = readConfig()
    if (!currentConfig.window.collapsed) return
    const [x, y] = mainWindow.getPosition()
    lastCollapsedPosition = { x, y }
    saveConfig({ window: { x, y, collapsed: true } })
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.on('close', (event) => {
    if (isQuitting) return
    if (backgroundRemovalInstalling) {
      event.preventDefault()
      collapseWindow()
      return
    }
    if (!readConfig().workflow.keepInBackground) {
      isQuitting = true
      return
    }
    event.preventDefault()
    collapseWindow()
  })

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function createTray(): void {
  const icon = nativeImage.createFromPath(trayIconPath()).resize({ width: 16, height: 16 })
  tray = new Tray(icon)
  tray.setToolTip(APP_DISPLAY_NAME)
  tray.on('click', () => expandWindow())
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '展开', click: () => expandWindow() },
      { label: '收起', click: () => collapseWindow() },
      { type: 'separator' },
      { label: `软件设计：${SOFTWARE_DESIGNER}`, enabled: false },
      { label: `版本 ${app.getVersion()}`, enabled: false },
      { type: 'separator' },
      { label: '退出', click: () => app.quit() }
    ])
  )
}

function createApplicationMenu(): void {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: APP_DISPLAY_NAME,
        submenu: [
          { label: `软件设计：${SOFTWARE_DESIGNER}`, enabled: false },
          { label: `版本 ${app.getVersion()}`, enabled: false },
          { type: 'separator' },
          { label: '退出', click: () => app.quit() }
        ]
      }
    ])
  )
}

function expandWindow(): void {
  if (!mainWindow) return
  mainWindow.setOpacity(1)
  const config = readConfig()
  if (config.window.collapsed) {
    const bounds = mainWindow.getBounds()
    lastCollapsedPosition = { x: bounds.x, y: bounds.y }
  }
  resizeExpandedWindow(EXPANDED_WIDTH, EXPANDED_HEIGHT)
  mainWindow.webContents.send('window:state', 'expanded')
  saveConfig({ window: { ...readConfig().window, collapsed: false } })
}

function resizeExpandedWindow(width: number, height: number, animate = true): void {
  if (!mainWindow) return
  const currentBounds = mainWindow.getBounds()
  const workArea = screen.getDisplayMatching(currentBounds).workArea
  const nextWidth = Math.max(640, Math.min(width, workArea.width - 24))
  const nextHeight = Math.max(560, Math.min(height, workArea.height - 24))
  const nextX = Math.min(Math.max(currentBounds.x, workArea.x + 12), workArea.x + workArea.width - nextWidth - 12)
  const nextY = Math.min(Math.max(currentBounds.y, workArea.y + 12), workArea.y + workArea.height - nextHeight - 12)

  mainWindow.setResizable(true)
  mainWindow.setMinimumSize(Math.min(INNER_WIDTH, nextWidth), Math.min(INNER_HEIGHT, nextHeight))
  setWindowBoundsSafely({ x: nextX, y: nextY, width: nextWidth, height: nextHeight }, animate)
}

function setWindowMode(mode: 'upload' | 'toolbox' | 'compression' | 'background-removal'): void {
  if (!mainWindow) return
  const config = readConfig()
  const wasCollapsed = config.window.collapsed
  if (wasCollapsed) {
    const bounds = mainWindow.getBounds()
    lastCollapsedPosition = { x: bounds.x, y: bounds.y }
    mainWindow.setOpacity(0)
  }
  if (mode === 'compression') {
    resizeExpandedWindow(COMPRESSION_WIDTH, COMPRESSION_HEIGHT, !wasCollapsed)
  } else if (mode === 'background-removal') {
    resizeExpandedWindow(BACKGROUND_REMOVAL_WIDTH, BACKGROUND_REMOVAL_HEIGHT, !wasCollapsed)
  } else if (mode === 'toolbox') {
    resizeExpandedWindow(TOOLBOX_WIDTH, TOOLBOX_HEIGHT, !wasCollapsed)
  } else {
    resizeExpandedWindow(EXPANDED_WIDTH, EXPANDED_HEIGHT, !wasCollapsed)
  }
  mainWindow.webContents.send('window:state', 'expanded')
  saveConfig({ window: { ...readConfig().window, collapsed: false } })
  if (wasCollapsed) {
    setTimeout(() => mainWindow?.setOpacity(1), 48)
  } else {
    mainWindow.setOpacity(1)
  }
}

function resolveCollapseTarget(): { x: number; y: number; deltaX: number; deltaY: number } {
  if (!mainWindow) return { x: 0, y: 0, deltaX: 0, deltaY: 0 }
  const config = readConfig()
  const currentBounds = mainWindow.getBounds()
  const workArea = screen.getDisplayMatching(currentBounds).workArea
  const fallbackX =
    typeof config.window.x === 'number'
      ? config.window.x
      : Math.round(currentBounds.x + (currentBounds.width - COLLAPSED_WIDTH) / 2)
  const fallbackY =
    typeof config.window.y === 'number'
      ? config.window.y
      : Math.round(currentBounds.y + (currentBounds.height - COLLAPSED_HEIGHT) / 2)
  const targetPosition = lastCollapsedPosition || { x: fallbackX, y: fallbackY }
  const nextX = Math.min(
    Math.max(Math.round(targetPosition.x), workArea.x + 8),
    workArea.x + workArea.width - COLLAPSED_WIDTH - 8
  )
  const nextY = Math.min(
    Math.max(Math.round(targetPosition.y), workArea.y + 8),
    workArea.y + workArea.height - COLLAPSED_HEIGHT - 8
  )
  lastCollapsedPosition = { x: nextX, y: nextY }
  return {
    x: nextX,
    y: nextY,
    deltaX: nextX - currentBounds.x + COLLAPSED_WIDTH / 2 - currentBounds.width / 2,
    deltaY: nextY - currentBounds.y + COLLAPSED_HEIGHT / 2 - currentBounds.height / 2
  }
}

function revealCollapsedWindow(): void {
  mainWindow?.setOpacity(1)
}

function collapseWindow(options: { deferReveal?: boolean } = {}): void {
  if (!mainWindow) return
  const target = resolveCollapseTarget()
  saveConfig({ window: { x: target.x, y: target.y, collapsed: true } })
  mainWindow.setOpacity(0)
  mainWindow.setMinimumSize(112, 112)
  setWindowBoundsSafely({ x: target.x, y: target.y, width: COLLAPSED_WIDTH, height: COLLAPSED_HEIGHT }, false)
  mainWindow.webContents.send('window:state', 'collapsed')
  if (!options.deferReveal) {
    setTimeout(() => {
      revealCollapsedWindow()
    }, 120)
  }
}

function outputDirectory(config: AppConfig, dateText: string, item?: ImageItem): string {
  const outputGroup = config.workflow.tableOutputGroups?.[config.feishu.tableId]
  const groupDir = outputGroup ? config.workflow.groupOutputDirs?.[outputGroup] || '' : ''
  const projectDir = config.workflow.projectOutputDirs?.[config.feishu.tableId] || ''
  const projectVideoDir = config.workflow.projectVideoOutputDirs?.[config.feishu.tableId] || ''
  const baseDir =
    item?.sourceType === 'video-frame'
      ? groupDir || projectVideoDir || projectDir || config.workflow.outputDir || ''
      : groupDir || projectDir || config.workflow.outputDir || ''
  if (!baseDir) return ''
  if (!config.workflow.organizeByMonth) {
    mkdirSync(baseDir, { recursive: true })
    return baseDir
  }
  const date = dateText ? new Date(`${dateText}T00:00:00`) : new Date()
  const validDate = Number.isNaN(date.getTime()) ? new Date() : date
  const year = String(validDate.getFullYear())
  const month = `${validDate.getMonth() + 1}月`
  const targetDir = join(baseDir, year, month)
  mkdirSync(targetDir, { recursive: true })
  return targetDir
}

async function imageToItem(filePath: string): Promise<ImageItem> {
  const metadata = await sharp(filePath).metadata()
  const buffer = readFileSync(filePath)
  const ext = extname(filePath).toLowerCase().replace('.', '') || 'png'
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    path: filePath,
    fileName: basename(filePath),
    dataUrl: `data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,${buffer.toString('base64')}`,
    width: metadata.width || 1,
    height: metadata.height || 1,
    status: 'waiting',
    sourceType: 'image'
  }
}

async function importImages(paths: string[]): Promise<ImageItem[]> {
  const files = paths.filter((filePath) => IMAGE_EXTENSIONS.has(extname(filePath).toLowerCase()))
  const items: ImageItem[] = []
  for (const file of files) {
    items.push(await imageToItem(file))
  }
  return items
}

async function saveVideoFrame(dataUrl: string, fileName: string): Promise<ImageItem> {
  const match = dataUrl.match(/^data:image\/png;base64,(.+)$/)
  if (!match) throw new Error('视频截图数据无效')
  const safeName = fileName.replace(/[\\/:*?"<>|]/g, '_')
  const tempPath = join(
    app.getPath('temp'),
    `boli-video-frame-${Date.now()}-${Math.random().toString(16).slice(2)}-${safeName}`
  )
  writeFileSync(tempPath, Buffer.from(match[1], 'base64'))
  return { ...(await imageToItem(tempPath)), sourceType: 'video-frame' }
}

function listAssets(dir: string): AssetFile[] {
  if (!dir || !existsSync(dir)) return []
  return readdirSync(dir)
    .filter((name) => IMAGE_EXTENSIONS.has(extname(name).toLowerCase()))
    .map((name) => {
      const path = join(dir, name)
      const ext = extname(name).toLowerCase().replace('.', '') || 'png'
      const dataUrl = `data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,${readFileSync(path).toString('base64')}`
      return { name, path, dataUrl }
    })
}

function requireFeishuConfig(config: AppConfig): FeishuCredentials {
  const { feishu } = config
  if (!feishu.appId || !feishu.appSecret || !feishu.appToken || !feishu.tableId) {
    throw new Error('请先在设置里填写飞书 app_id、app_secret、app_token 和 table_id。')
  }
  return feishu
}

async function feishuRequest<T>(
  path: string,
  init: RequestInit = {},
  credentials = readConfig().feishu
): Promise<T> {
  const token = await getTenantAccessToken(credentials)
  const response = await fetch(`https://open.feishu.cn${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body instanceof FormData ? {} : { 'Content-Type': 'application/json; charset=utf-8' }),
      ...(init.headers || {})
    }
  })
  const data = (await response.json()) as { code?: number; msg?: string; data?: T }
  if (!response.ok || data.code !== 0) {
    throw new Error(data.msg || `飞书请求失败：${response.status}`)
  }
  return data.data as T
}

async function getTenantAccessToken(credentials: FeishuCredentials): Promise<string> {
  if (!credentials.appId || !credentials.appSecret) {
    throw new Error('请先填写飞书 app_id 和 app_secret。')
  }
  if (tenantTokenCache && tenantTokenCache.expiresAt > Date.now() + 60_000) return tenantTokenCache.token

  const response = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      app_id: credentials.appId,
      app_secret: credentials.appSecret
    })
  })
  const data = (await response.json()) as {
    code?: number
    msg?: string
    tenant_access_token?: string
    expire?: number
  }
  if (!response.ok || data.code !== 0 || !data.tenant_access_token) {
    throw new Error(data.msg || '获取 tenant_access_token 失败。')
  }
  tenantTokenCache = {
    token: data.tenant_access_token,
    expiresAt: Date.now() + Math.max(60, data.expire || 7200) * 1000
  }
  return tenantTokenCache.token
}

function normalizeField(field: Record<string, unknown>): BitableField {
  const property = (field.property || {}) as { options?: Array<{ id?: string; name?: string; color?: number }> }
  return {
    fieldId: String(field.field_id || ''),
    fieldName: String(field.field_name || ''),
    type: typeof field.type === 'number' ? field.type : undefined,
    uiType: typeof field.ui_type === 'string' ? field.ui_type : undefined,
    options: (property.options || [])
      .map((option) => ({
        id: option.id,
        name: option.name || '',
        color: option.color
      }))
      .filter((option) => option.name)
  }
}

async function syncSchema(requestedTableId?: string): Promise<SchemaSnapshot> {
  const config = readConfig()
  if (!config.feishu.appId || !config.feishu.appSecret || !config.feishu.appToken) {
    throw new Error('请先填写飞书 app_id、app_secret 和 app_token。')
  }
  const tablesData = await feishuRequest<{ items?: Array<{ table_id: string; name: string }> }>(
    `/open-apis/bitable/v1/apps/${config.feishu.appToken}/tables?page_size=100`
  )
  const tables: TableInfo[] = (tablesData.items || []).map((table) => ({
    tableId: table.table_id,
    name: table.name
  }))
  const tableId = requestedTableId || config.feishu.tableId || tables[0]?.tableId || ''
  if (tableId && tableId !== config.feishu.tableId) saveConfig({ feishu: { ...config.feishu, tableId } })
  const fieldsData = tableId
    ? await feishuRequest<{ items?: Array<Record<string, unknown>> }>(
        `/open-apis/bitable/v1/apps/${config.feishu.appToken}/tables/${tableId}/fields?page_size=100`
      )
    : { items: [] }

  return {
    tables,
    fields: (fieldsData.items || []).map(normalizeField)
  }
}

async function resolveProgressDoneValue(config: AppConfig): Promise<string> {
  const fieldName = config.fieldMapping.progress
  if (!fieldName) return DONE_PROGRESS_VALUE
  const fieldsData = await feishuRequest<{ items?: Array<Record<string, unknown>> }>(
    `/open-apis/bitable/v1/apps/${config.feishu.appToken}/tables/${config.feishu.tableId}/fields?page_size=100`,
    {},
    config.feishu
  )
  const field = (fieldsData.items || []).map(normalizeField).find((item) => item.fieldName === fieldName)
  const options = field?.options || []
  const exact = DONE_PROGRESS_FALLBACK_VALUES.map((value) => options.find((option) => option.name === value)).find(Boolean)
  if (exact?.name) return exact.name
  const normalizedTargets = DONE_PROGRESS_FALLBACK_VALUES.map((value) => value.toLowerCase().replace(/\s+/g, ''))
  const close = options.find((option) => normalizedTargets.includes(option.name.toLowerCase().replace(/\s+/g, '')))
  if (close?.name) return close.name
  const completed = options.find((option) => option.name.includes('\u5b8c\u6210') && !option.name.includes('\u672a'))
  return completed?.name || DONE_PROGRESS_VALUE
}

async function updateProgressDone(config: AppConfig, recordId: string): Promise<void> {
  await updateRecord(config, recordId, {
    [config.fieldMapping.progress]: await resolveProgressDoneValue(config)
  })
}

function dateToFeishuValue(date: string): number | string {
  if (!date) return ''
  const parsed = new Date(`${date}T00:00:00+08:00`).getTime()
  return Number.isFinite(parsed) ? parsed : date
}

function buildBaseFields(config: AppConfig, selections: UploadRequest['selections']): Record<string, unknown> {
  const m = config.fieldMapping
  const fields: Record<string, unknown> = {}
  fields[m.language] = selections.language
  fields[m.size] = selections.size
  fields[m.assetContent] = selections.assetContent
  fields[m.detailContent] = selections.detailContent
  fields[m.designer] = selections.designer
  fields[m.creative] = selections.creative
  fields[m.completionDate] = dateToFeishuValue(selections.completionDate)
  return fields
}

async function createRecord(config: AppConfig, selections: UploadRequest['selections']): Promise<FeishuRecord> {
  const data = await feishuRequest<{ record: { record_id: string; fields: Record<string, unknown> } }>(
    `/open-apis/bitable/v1/apps/${config.feishu.appToken}/tables/${config.feishu.tableId}/records`,
    {
      method: 'POST',
      body: JSON.stringify({ fields: buildBaseFields(config, selections) })
    },
    config.feishu
  )
  return { recordId: data.record.record_id, fields: data.record.fields }
}

async function getRecord(config: AppConfig, recordId: string): Promise<FeishuRecord> {
  const data = await feishuRequest<{ record: { record_id: string; fields: Record<string, unknown> } }>(
    `/open-apis/bitable/v1/apps/${config.feishu.appToken}/tables/${config.feishu.tableId}/records/${recordId}`,
    {},
    config.feishu
  )
  return { recordId: data.record.record_id, fields: data.record.fields }
}

async function updateRecord(config: AppConfig, recordId: string, fields: Record<string, unknown>): Promise<void> {
  await feishuRequest(
    `/open-apis/bitable/v1/apps/${config.feishu.appToken}/tables/${config.feishu.tableId}/records/${recordId}`,
    {
      method: 'PUT',
      body: JSON.stringify({ fields })
    },
    config.feishu
  )
}

function stringifyCellValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (Array.isArray(value)) return value.map(stringifyCellValue).filter(Boolean).join('')
  if (typeof value === 'object') {
    const objectValue = value as Record<string, unknown>
    return stringifyCellValue(objectValue.text || objectValue.name || objectValue.value || objectValue.link)
  }
  return String(value)
}

async function waitForGeneratedName(config: AppConfig, recordId: string): Promise<string> {
  const fieldName = config.fieldMapping.fullName
  for (let i = 0; i < 10; i++) {
    const record = await getRecord(config, recordId)
    const generatedName = sanitizeFileBaseName(stringifyCellValue(record.fields[fieldName]))
    if (generatedName) return generatedName
    await new Promise((resolve) => setTimeout(resolve, 800))
  }
  throw new Error(`飞书记录已创建，但字段「${fieldName}」还没有生成素材完整命名。`)
}

function sanitizeFileBaseName(name: string): string {
  return name.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-').replace(/\s+/g, ' ').trim()
}

function uniquePath(targetPath: string): string {
  if (!existsSync(targetPath)) return targetPath
  const ext = extname(targetPath)
  const base = targetPath.slice(0, -ext.length)
  let i = 1
  while (existsSync(`${base}(${i})${ext}`)) i++
  return `${base}(${i})${ext}`
}

async function prepareOverlay(
  settings: OverlaySettings,
  baseWidth: number,
  baseHeight: number
): Promise<sharp.OverlayOptions | null> {
  if (!settings.enabled || !settings.assetPath || !existsSync(settings.assetPath)) return null
  const source = sharp(settings.assetPath).ensureAlpha()
  const metadata = await source.metadata()
  const originalWidth = metadata.width || 1
  const targetWidth = Math.max(8, Math.round(baseWidth * settings.scale))
  const targetHeight = Math.max(8, Math.round(((metadata.height || 1) / originalWidth) * targetWidth))
  let overlay = await source.resize({ width: targetWidth, height: targetHeight, fit: 'inside' }).png().toBuffer()
  if (settings.opacity < 1) {
    overlay = await sharp(overlay)
      .ensureAlpha()
      .joinChannel(
        await sharp(overlay)
          .ensureAlpha()
          .extractChannel('alpha')
          .linear(settings.opacity, 0)
          .toBuffer()
      )
      .png()
      .toBuffer()
  }
  if (settings.rotation) {
    overlay = await sharp(overlay).rotate(settings.rotation, { background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer()
  }
  const rotatedMeta = await sharp(overlay).metadata()
  const width = rotatedMeta.width || targetWidth
  const height = rotatedMeta.height || targetHeight
  return {
    input: overlay,
    left: Math.max(0, Math.min(baseWidth - width, Math.round(baseWidth * settings.x - width / 2))),
    top: Math.max(0, Math.min(baseHeight - height, Math.round(baseHeight * settings.y - height / 2)))
  }
}

async function compositeImageToFile(inputPath: string, overlays: OverlayState, outputPath: string): Promise<void> {
  const metadata = await sharp(inputPath).metadata()
  const baseWidth = metadata.width || 1
  const baseHeight = metadata.height || 1
  const overlayOptions = (
    await Promise.all([
      prepareOverlay(overlays.logo, baseWidth, baseHeight),
      prepareOverlay(overlays.slogan, baseWidth, baseHeight),
      prepareOverlay(overlays.icon, baseWidth, baseHeight)
    ])
  ).filter(Boolean) as sharp.OverlayOptions[]
  let pipeline = sharp(inputPath)
  if (overlayOptions.length) pipeline = pipeline.composite(overlayOptions)
  if (['.jpg', '.jpeg'].includes(extname(outputPath).toLowerCase())) {
    pipeline = pipeline.flatten({ background: '#ffffff' }).jpeg({
      quality: 92,
      mozjpeg: true,
      progressive: true,
      chromaSubsampling: '4:4:4',
      optimizeCoding: true
    })
  }
  await pipeline.toFile(outputPath)
}

async function previewComposite(inputPath: string, overlays: OverlayState, width: number, height: number): Promise<string> {
  const tempPath = join(app.getPath('temp'), `asset-uploader-preview-${Date.now()}.png`)
  await compositeImageToFile(inputPath, overlays, tempPath)
  const buffer = await sharp(tempPath)
    .resize({ width: Math.round(width), height: Math.round(height), fit: 'inside' })
    .png()
    .toBuffer()
  try {
    rmSync(tempPath, { force: true })
  } catch {
    // Best effort cleanup.
  }
  return `data:image/png;base64,${buffer.toString('base64')}`
}

function normalizeCompressionOptions(options: CompressionOptions): CompressionOptions {
  return {
    ...defaultCompression.defaultOptions,
    ...options,
    quality: Math.max(1, Math.min(100, Math.round(options.quality || defaultCompression.defaultOptions.quality))),
    longEdge: Math.max(16, Math.round(options.longEdge || defaultCompression.defaultOptions.longEdge)),
    width: Math.max(16, Math.round(options.width || defaultCompression.defaultOptions.width)),
    height: Math.max(16, Math.round(options.height || defaultCompression.defaultOptions.height)),
    background: options.background || defaultCompression.defaultOptions.background,
    pngCompressionLevel: Math.max(
      0,
      Math.min(9, Math.round(options.pngCompressionLevel ?? defaultCompression.defaultOptions.pngCompressionLevel))
    ),
    webpAlphaQuality: Math.max(
      0,
      Math.min(100, Math.round(options.webpAlphaQuality ?? defaultCompression.defaultOptions.webpAlphaQuality))
    ),
    encoderEffort: Math.max(0, Math.min(9, Math.round(options.encoderEffort ?? defaultCompression.defaultOptions.encoderEffort)))
  }
}

function mimeForFormat(format: string): string {
  if (format === 'jpg') return 'image/jpeg'
  if (format === 'jpeg') return 'image/jpeg'
  if (format === 'webp') return 'image/webp'
  if (format === 'avif') return 'image/avif'
  return 'image/png'
}

function outputExtensionForFormat(format: string): string {
  if (format === 'jpeg') return '.jpg'
  if (format === 'jpg') return '.jpg'
  if (format === 'webp') return '.webp'
  if (format === 'avif') return '.avif'
  return '.png'
}

function resolveCompressionFormat(sourceFormat: string | undefined, options: CompressionOptions): string {
  if (options.format !== 'original') return options.format
  const normalized = (sourceFormat || 'png').toLowerCase()
  if (normalized === 'jpg') return 'jpeg'
  if (['jpeg', 'png', 'webp', 'avif'].includes(normalized)) return normalized
  return 'png'
}

function compressedOutputPath(inputPath: string, outputDir: string, outputFormat: string): string {
  const targetDir = outputDir || join(dirname(inputPath), 'output')
  const sourceBase = basename(inputPath, extname(inputPath))
  mkdirSync(targetDir, { recursive: true })
  return uniquePath(join(targetDir, `${sourceBase}${outputExtensionForFormat(outputFormat)}`))
}

async function compressionPipeline(inputPath: string, optionsInput: CompressionOptions): Promise<{
  buffer: Buffer
  format: string
  width: number
  height: number
  warning?: string
}> {
  const options = normalizeCompressionOptions(optionsInput)
  const metadata = await sharp(inputPath).metadata()
  const outputFormat = resolveCompressionFormat(metadata.format, options)
  let pipeline = sharp(inputPath, { failOn: 'none' }).rotate()
  if (options.resizeMode === 'longEdge') {
    pipeline = pipeline.resize({
      width: options.longEdge,
      height: options.longEdge,
      fit: 'inside',
      withoutEnlargement: true
    })
  } else if (options.resizeMode === 'exact') {
    pipeline = pipeline.resize({
      width: options.width,
      height: options.height,
      fit: 'inside',
      withoutEnlargement: true
    })
  }

  if (!options.removeMetadata) pipeline = pipeline.withMetadata()

  let warning = ''
  if (outputFormat === 'jpeg') {
    if (metadata.hasAlpha) warning = '透明区域已按背景色合成为 JPG。'
    pipeline = pipeline.flatten({ background: options.background }).jpeg({
      quality: options.quality,
      mozjpeg: true,
      progressive: options.jpegProgressive,
      chromaSubsampling: options.jpegChromaSubsampling,
      trellisQuantisation: true,
      overshootDeringing: true,
      optimizeScans: options.jpegProgressive,
      optimizeCoding: true
    })
  } else if (outputFormat === 'webp') {
    pipeline = pipeline.webp({
      quality: options.quality,
      effort: Math.min(6, options.encoderEffort),
      lossless: options.webpLossless,
      nearLossless: options.webpNearLossless,
      alphaQuality: options.webpAlphaQuality,
      smartSubsample: true,
      preset: 'picture'
    })
  } else if (outputFormat === 'avif') {
    pipeline = pipeline.avif({ quality: options.quality, effort: options.encoderEffort, lossless: options.webpLossless })
  } else {
    pipeline = pipeline.png({
      compressionLevel: options.pngCompressionLevel,
      palette: options.webpLossless ? false : options.pngPalette,
      quality: options.quality,
      effort: options.encoderEffort
    })
  }

  const buffer = await pipeline.toBuffer()
  const outputMeta = await sharp(buffer).metadata()
  return {
    buffer,
    format: outputFormat,
    width: outputMeta.width || metadata.width || 1,
    height: outputMeta.height || metadata.height || 1,
    warning
  }
}

async function inspectCompressionImage(filePath: string): Promise<{
  path: string
  fileName: string
  width: number
  height: number
  format: string
  size: number
  hasAlpha: boolean
  dataUrl: string
}> {
  if (!IMAGE_EXTENSIONS.has(extname(filePath).toLowerCase())) throw new Error('请选择 PNG / JPG / WebP 图片。')
  const metadata = await sharp(filePath).metadata()
  const buffer = readFileSync(filePath)
  const format = metadata.format || extname(filePath).replace('.', '') || 'png'
  return {
    path: filePath,
    fileName: basename(filePath),
    width: metadata.width || 1,
    height: metadata.height || 1,
    format,
    size: buffer.length,
    hasAlpha: Boolean(metadata.hasAlpha),
    dataUrl: `data:${mimeForFormat(format)};base64,${buffer.toString('base64')}`
  }
}

async function previewCompression(request: CompressionPreviewRequest): Promise<CompressionPreviewResult> {
  const result = await compressionPipeline(request.path, request.options)
  return {
    dataUrl: `data:${mimeForFormat(result.format)};base64,${result.buffer.toString('base64')}`,
    size: result.buffer.length,
    format: result.format,
    width: result.width,
    height: result.height,
    warning: result.warning
  }
}

async function runCompression(request: CompressionRunRequest): Promise<CompressionRunResult[]> {
  if (request.outputDir) mkdirSync(request.outputDir, { recursive: true })
  const results: CompressionRunResult[] = []
  for (const item of request.items) {
    try {
      const compressed = await compressionPipeline(item.path, item.options)
      const outputPath = compressedOutputPath(item.path, request.outputDir, compressed.format)
      writeFileSync(outputPath, compressed.buffer)
      results.push({
        id: item.id,
        outputPath,
        outputSize: compressed.buffer.length,
        format: compressed.format,
        warning: compressed.warning
      })
    } catch (error) {
      results.push({
        id: item.id,
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }
  return results
}

function backgroundRemovalPaths(): {
  installDir: string
  pythonPath: string
  scriptPath: string
  cacheDir: string
  manifestPath: string
} {
  const projectRoot = app.getAppPath()
  const configuredDir = readConfig().backgroundRemoval.installDir
  const installDir = configuredDir || (app.isPackaged
    ? join(app.getPath('userData'), 'ai-background-removal')
    : join(projectRoot, '.birefnet-demo'))
  return {
    installDir,
    pythonPath: join(installDir, '.venv', 'Scripts', 'python.exe'),
    scriptPath: app.isPackaged || Boolean(configuredDir)
      ? join(installDir, 'birefnet_demo.py')
      : join(projectRoot, 'scripts', 'birefnet_demo.py'),
    cacheDir: join(installDir, 'models'),
    manifestPath: join(installDir, 'runtime.json')
  }
}

function backgroundRemovalRuntimeStatus(): BackgroundRemovalRuntimeStatus {
  const paths = backgroundRemovalPaths()
  const ready = existsSync(paths.pythonPath) && existsSync(paths.scriptPath)
  const snapshotsDir = join(paths.cacheDir, 'models--ZhengPeng7--BiRefNet_dynamic', 'snapshots')
  const modelDownloaded = existsSync(snapshotsDir) && readdirSync(snapshotsDir).length > 0
  return {
    ready,
    installing: backgroundRemovalInstalling,
    modelDownloaded,
    installDir: paths.installDir,
    modelDir: paths.cacheDir,
    message: ready
      ? modelDownloaded
        ? 'BiRefNet 模型已就绪'
        : '运行环境已就绪，首次抠图将下载约 444 MB 模型'
      : '尚未安装本地 BiRefNet demo 运行环境'
  }
}

function publishBackgroundRemovalProgress(progress: BackgroundRemovalProgress): void {
  mainWindow?.webContents.send('background-removal:progress', progress)
}

async function downloadRuntimeFile(url: string, targetPath: string): Promise<void> {
  const response = await fetch(url, { redirect: 'follow' })
  if (!response.ok || !response.body) throw new Error(`下载失败：HTTP ${response.status}`)
  const total = Number(response.headers.get('content-length') || 0)
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let received = 0
  const started = Date.now()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value) continue
    chunks.push(value)
    received += value.byteLength
    const seconds = Math.max(0.1, (Date.now() - started) / 1000)
    publishBackgroundRemovalProgress({
      phase: 'downloading',
      status: `正在下载安装工具${total ? ` ${Math.round(received * 100 / total)}%` : ''}`,
      percent: total ? Math.min(15, Math.round(received * 15 / total)) : 5,
      determinate: total > 0,
      speedBytesPerSecond: Math.round(received / seconds)
    })
  }
  writeFileSync(targetPath, Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))))
}

async function runRuntimeCommand(
  command: string,
  args: string[],
  options: { cwd: string; env?: NodeJS.ProcessEnv; onLine?: (line: string) => void; timeoutMs?: number }
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      windowsHide: true,
      env: { ...process.env, ...options.env, PYTHONUTF8: '1' }
    })
    if (backgroundRemovalInstalling) backgroundRemovalInstallChild = child
    if (child.pid) {
      try {
        setPriority(child.pid, osConstants.priority.PRIORITY_BELOW_NORMAL)
      } catch {
        // Some managed Windows environments do not allow changing process priority.
      }
    }
    let output = ''
    let errorOutput = ''
    let timedOut = false
    const timeout = options.timeoutMs
      ? setTimeout(() => {
          timedOut = true
          child.kill()
        }, options.timeoutMs)
      : null
    const clearCommandTimeout = (): void => {
      if (timeout) clearTimeout(timeout)
    }
    const consume = (chunk: Buffer, isError = false): void => {
      const text = chunk.toString('utf8')
      if (isError) errorOutput = `${errorOutput}${text}`.slice(-32_000)
      output += text
      const lines = output.split(/\r\n?|\n/)
      output = lines.pop() || ''
      lines.forEach((line) => options.onLine?.(line))
    }
    child.stdout.on('data', (chunk: Buffer) => consume(chunk))
    child.stderr.on('data', (chunk: Buffer) => consume(chunk, true))
    child.on('error', (error) => {
      clearCommandTimeout()
      reject(error)
    })
    child.on('close', (code) => {
      clearCommandTimeout()
      if (backgroundRemovalInstallChild === child) backgroundRemovalInstallChild = null
      if (output.trim()) options.onLine?.(output.trim())
      if (timedOut) {
        reject(new Error('安装下载长时间没有完成。请检查网络，或改用快速兼容安装（CPU）。'))
        return
      }
      if (code === 0) resolve()
      else reject(new Error(errorOutput.trim() || `安装命令失败（退出码 ${code ?? 'unknown'}）`))
    })
  })
}

function cancelBackgroundRemovalInstallation(): boolean {
  if (!backgroundRemovalInstalling) return false
  backgroundRemovalInstallCancelled = true
  const child = backgroundRemovalInstallChild
  if (child && !child.killed) child.kill()
  publishBackgroundRemovalProgress({
    phase: 'error',
    status: '安装已暂停，已完成的下载缓存会保留。稍后可重新点击安装继续。',
    percent: 0,
    determinate: true
  })
  return true
}

async function hasNvidiaGpu(): Promise<boolean> {
  try {
    await runRuntimeCommand('nvidia-smi.exe', ['--query-gpu=name', '--format=csv,noheader'], {
      cwd: app.getPath('temp')
    })
    return true
  } catch {
    return false
  }
}

async function tryAdoptExistingBackgroundRemovalRuntime(): Promise<boolean> {
  const paths = backgroundRemovalPaths()
  const snapshotsDir = join(paths.cacheDir, 'models--ZhengPeng7--BiRefNet_dynamic', 'snapshots')
  if (!existsSync(paths.pythonPath) || !existsSync(snapshotsDir) || readdirSync(snapshotsDir).length === 0) {
    return false
  }

  const bundledScript = app.isPackaged
    ? join(process.resourcesPath, 'birefnet-runtime', 'birefnet_demo.py')
    : join(app.getAppPath(), 'scripts', 'birefnet_demo.py')
  if (!existsSync(bundledScript)) return false
  if (bundledScript !== paths.scriptPath) copyFileSync(bundledScript, paths.scriptPath)

  publishBackgroundRemovalProgress({
    phase: 'verifying',
    status: '正在校验已有本地 AI 环境',
    percent: 70,
    determinate: true
  })
  try {
    await runRuntimeCommand(
      paths.pythonPath,
      ['-c', 'import torch, transformers, PIL, timm, kornia; print(torch.__version__)'],
      { cwd: paths.installDir }
    )
  } catch {
    return false
  }

  writeFileSync(paths.manifestPath, JSON.stringify({
    version: '1',
    model: 'ZhengPeng7/BiRefNet_dynamic',
    adopted: true,
    installedAt: new Date().toISOString()
  }, null, 2), 'utf8')
  publishBackgroundRemovalProgress({
    phase: 'complete',
    status: '已复用现有本地 AI 抠图环境，无需重复下载',
    percent: 100,
    determinate: true
  })
  return true
}

async function installBackgroundRemovalRuntime(request: BackgroundRemovalInstallRequest): Promise<BackgroundRemovalRuntimeStatus> {
  if (backgroundRemovalInstalling) throw new Error('本地 AI 环境正在安装，请勿重复启动。')
  backgroundRemovalInstalling = true
  backgroundRemovalInstallCancelled = false
  try {
    const requestedDir = request.installDir
    const accelerator = request.accelerator
    if (requestedDir) saveConfig({ backgroundRemoval: { installDir: requestedDir } })
    const paths = backgroundRemovalPaths()
    mkdirSync(paths.installDir, { recursive: true })
    mkdirSync(paths.cacheDir, { recursive: true })
    if (await tryAdoptExistingBackgroundRemovalRuntime()) {
      backgroundRemovalInstalling = false
      return backgroundRemovalRuntimeStatus()
    }
    const toolsDir = join(paths.installDir, 'tools')
    mkdirSync(toolsDir, { recursive: true })
    const uvPath = join(toolsDir, 'uv.exe')
    const runtimeEnv = {
      UV_CACHE_DIR: join(paths.installDir, '.uv-cache'),
      UV_PYTHON_INSTALL_DIR: join(paths.installDir, 'python'),
      UV_PYTHON_PREFERENCE: 'only-managed',
      UV_HTTP_CONNECT_TIMEOUT: '15',
      UV_HTTP_TIMEOUT: '60',
      UV_HTTP_RETRIES: '2',
      UV_LOCK_TIMEOUT: '5',
      UV_CONCURRENT_DOWNLOADS: '2',
      UV_CONCURRENT_INSTALLS: '1',
      UV_CONCURRENT_BUILDS: '1',
      UV_NO_PROGRESS: '1'
    }

    if (!existsSync(uvPath)) {
      const archivePath = join(paths.installDir, 'uv-windows.zip')
      const uvUrl = 'https://github.com/astral-sh/uv/releases/latest/download/uv-x86_64-pc-windows-msvc.zip'
      publishBackgroundRemovalProgress({ phase: 'downloading', status: '正在下载 Python 环境安装工具', percent: 1, determinate: false })
      await downloadRuntimeFile(uvUrl, archivePath)
      const checksumResponse = await fetch(`${uvUrl}.sha256`, { redirect: 'follow' })
      if (!checksumResponse.ok) throw new Error('无法获取安装工具校验文件。')
      const expectedHash = (await checksumResponse.text()).trim().split(/\s+/)[0]?.toLowerCase()
      const actualHash = createHash('sha256').update(readFileSync(archivePath)).digest('hex')
      if (!expectedHash || actualHash !== expectedHash) throw new Error('安装工具校验失败，请重试。')
      publishBackgroundRemovalProgress({ phase: 'verifying', status: '安装工具校验完成，正在解压', percent: 16, determinate: true })
      await runRuntimeCommand('tar.exe', ['-xf', archivePath, '-C', toolsDir], { cwd: paths.installDir })
      rmSync(archivePath, { force: true })
    }

    const useNvidia = accelerator === 'nvidia'
    if (useNvidia && !(await hasNvidiaGpu())) {
      throw new Error('未检测到可用的 NVIDIA 显卡或驱动，请选择快速兼容安装（CPU）。')
    }

    let runtimeDependenciesReady = false
    if (existsSync(paths.pythonPath)) {
      publishBackgroundRemovalProgress({
        phase: 'verifying',
        status: '正在检查已有 Python 推理环境',
        percent: 20,
        determinate: true
      })
      try {
        await runRuntimeCommand(
          paths.pythonPath,
          ['-c', `import torch, transformers, PIL, timm, kornia; ${useNvidia ? "assert torch.cuda.is_available(), 'CUDA unavailable'; " : ''}print(torch.__version__)`],
          { cwd: paths.installDir, env: runtimeEnv }
        )
        runtimeDependenciesReady = true
      } catch {
        runtimeDependenciesReady = false
      }
    }

    if (!runtimeDependenciesReady) {
      const venvDir = join(paths.installDir, '.venv')
      publishBackgroundRemovalProgress({
        phase: 'installing',
        status: existsSync(venvDir) ? '正在修复未完成的 Python 环境' : '正在准备独立 Python 3.11 环境',
        percent: 20,
        determinate: true
      })
      const venvArgs = ['venv']
      if (existsSync(venvDir)) venvArgs.push('--clear')
      venvArgs.push(venvDir, '--python', '3.11')
      await runRuntimeCommand(uvPath, venvArgs, {
        cwd: paths.installDir,
        env: runtimeEnv
      })

      publishBackgroundRemovalProgress({
        phase: 'installing',
        status: useNvidia
          ? '正在下载 PyTorch NVIDIA 版（约 2.56 GB）'
          : '正在下载 PyTorch CPU 兼容版（约 120 MB）',
        percent: 35,
        determinate: false
      })
      const torchArgs = ['pip', 'install', '--python', paths.pythonPath, 'torch', 'torchvision', '--index-url', useNvidia
        ? 'https://download.pytorch.org/whl/cu128'
        : 'https://download.pytorch.org/whl/cpu']
      const torchStartedAt = Date.now()
      let latestDetail = ''
      const publishTorchProgress = (): void => {
        const elapsedSeconds = Math.max(0, Math.round((Date.now() - torchStartedAt) / 1000))
        const elapsedText = elapsedSeconds >= 60
          ? `${Math.floor(elapsedSeconds / 60)}分${elapsedSeconds % 60}秒`
          : `${elapsedSeconds}秒`
        publishBackgroundRemovalProgress({
          phase: 'installing',
          status: `${useNvidia ? 'NVIDIA' : 'CPU'} 环境 · ${latestDetail || '正在下载并解压 PyTorch'} · 已用时 ${elapsedText}`,
          percent: 35,
          determinate: false
        })
      }
      publishTorchProgress()
      const progressTimer = setInterval(publishTorchProgress, 2000)
      try {
        await runRuntimeCommand(uvPath, torchArgs, {
          cwd: paths.installDir,
          env: runtimeEnv,
          timeoutMs: useNvidia ? 45 * 60_000 : 12 * 60_000,
          onLine: (line) => {
            const detail = line.replace(/\x1b\[[0-9;]*m/g, '').trim()
            if (detail) latestDetail = detail.slice(0, 80)
          }
        })
      } finally {
        clearInterval(progressTimer)
      }

      publishBackgroundRemovalProgress({ phase: 'installing', status: '正在安装 BiRefNet 推理依赖', percent: 62, determinate: true })
      await runRuntimeCommand(
        uvPath,
        ['pip', 'install', '--python', paths.pythonPath, 'transformers>=4.46,<5', 'pillow', 'safetensors', 'huggingface-hub', 'timm', 'kornia', 'einops', 'tqdm'],
        { cwd: paths.installDir, env: runtimeEnv }
      )
    } else {
      publishBackgroundRemovalProgress({
        phase: 'installing',
        status: '已复用现有 Python 推理环境',
        percent: 68,
        determinate: true
      })
    }

    const bundledScript = app.isPackaged
      ? join(process.resourcesPath, 'birefnet-runtime', 'birefnet_demo.py')
      : join(app.getAppPath(), 'scripts', 'birefnet_demo.py')
    if (!existsSync(bundledScript)) throw new Error('软件缺少 BiRefNet 推理脚本，请重新安装波利助手。')
    if (bundledScript !== paths.scriptPath) copyFileSync(bundledScript, paths.scriptPath)

    publishBackgroundRemovalProgress({ phase: 'downloading', status: '正在下载 BiRefNet 开源模型', percent: 72, determinate: false })
    await runRuntimeCommand(paths.pythonPath, [paths.scriptPath, '--prepare-only', '--cache-dir', paths.cacheDir], {
      cwd: paths.installDir,
      env: runtimeEnv,
      onLine: (line) => {
        try {
          const payload = JSON.parse(line) as Record<string, unknown>
          if (payload.event !== 'download-progress') return
          const modelPercent = Math.max(0, Math.min(100, Number(payload.progress || 0)))
          publishBackgroundRemovalProgress({
            phase: 'downloading',
            status: String(payload.message || '正在下载 BiRefNet 开源模型'),
            percent: 72 + Math.round(modelPercent * 0.23),
            determinate: payload.determinate !== false
          })
        } catch {
          // Ignore model-loader diagnostics.
        }
      }
    })

    publishBackgroundRemovalProgress({ phase: 'verifying', status: '正在校验本地 AI 环境', percent: 97, determinate: true })
    await runRuntimeCommand(
      paths.pythonPath,
      ['-c', 'import torch, transformers, PIL, timm, kornia; print(torch.__version__)'],
      { cwd: paths.installDir, env: runtimeEnv }
    )
    writeFileSync(paths.manifestPath, JSON.stringify({
      version: '1',
      model: 'ZhengPeng7/BiRefNet_dynamic',
      gpu: useNvidia ? 'nvidia' : 'cpu',
      installedAt: new Date().toISOString()
    }, null, 2), 'utf8')
    publishBackgroundRemovalProgress({ phase: 'complete', status: '本地 AI 抠图环境安装完成', percent: 100, determinate: true })
    backgroundRemovalInstalling = false
    return backgroundRemovalRuntimeStatus()
  } catch (error) {
    const message = backgroundRemovalInstallCancelled
      ? '安装已暂停，已完成的下载缓存会保留。稍后可重新点击安装继续。'
      : error instanceof Error ? error.message : String(error)
    publishBackgroundRemovalProgress({ phase: 'error', status: message, percent: 0, determinate: true })
    if (backgroundRemovalInstallCancelled) throw new Error(message)
    throw error
  } finally {
    backgroundRemovalInstalling = false
    backgroundRemovalInstallCancelled = false
    backgroundRemovalInstallChild = null
  }
}

function uniqueBackgroundRemovalPath(inputPath: string): string {
  const outputDir = join(dirname(inputPath), 'output')
  mkdirSync(outputDir, { recursive: true })
  const base = basename(inputPath, extname(inputPath))
  let candidate = join(outputDir, `${base}-cutout.png`)
  let suffix = 2
  while (existsSync(candidate)) {
    candidate = join(outputDir, `${base}-cutout-${suffix}.png`)
    suffix += 1
  }
  return candidate
}

async function runBackgroundRemoval(inputPath: string): Promise<BackgroundRemovalResult> {
  if (!IMAGE_EXTENSIONS.has(extname(inputPath).toLowerCase())) {
    throw new Error('请选择 PNG / JPG / WebP 图片。')
  }
  if (!existsSync(inputPath)) {
    throw new Error('原图文件已不存在，请重新选择图片。')
  }
  const paths = backgroundRemovalPaths()
  if (!existsSync(paths.pythonPath) || !existsSync(paths.scriptPath)) {
    throw new Error('BiRefNet demo 运行环境尚未安装，请先运行 scripts/setup-birefnet-demo.ps1。')
  }
  mkdirSync(paths.cacheDir, { recursive: true })
  const outputPath = uniqueBackgroundRemovalPath(inputPath)

  return new Promise((resolve, reject) => {
    const child = spawn(
      paths.pythonPath,
      [paths.scriptPath, inputPath, outputPath, '--cache-dir', paths.cacheDir],
      {
        cwd: paths.installDir,
        windowsHide: true,
        env: { ...process.env, PYTHONUTF8: '1' }
      }
    )
    let stdout = ''
    let stderr = ''
    let resultPayload: Omit<BackgroundRemovalResult, 'dataUrl'> | null = null

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8')
      const lines = stdout.split(/\r?\n/)
      stdout = lines.pop() || ''
      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const payload = JSON.parse(line) as Record<string, unknown>
          if (payload.event === 'complete') {
            resultPayload = {
              outputPath: String(payload.outputPath || outputPath),
              width: Number(payload.width || 1),
              height: Number(payload.height || 1),
              size: Number(payload.size || 0),
              elapsedMs: Number(payload.elapsedMs || 0)
            }
          } else if (payload.event === 'error') {
            stderr = String(payload.message || stderr)
          }
          if (payload.message || payload.event === 'complete') {
            const progress: BackgroundRemovalProgress = {
              phase:
                payload.event === 'download-progress'
                  ? 'downloading'
                  : payload.event === 'processing' || payload.event === 'postprocessing'
                    ? 'processing'
                    : payload.event === 'saving'
                      ? 'saving'
                      : payload.event === 'complete'
                        ? 'complete'
                        : payload.event === 'error'
                          ? 'error'
                          : 'loading',
              status: String(payload.message || (payload.event === 'complete' ? '抠图完成' : '正在准备')),
              percent: Math.max(0, Math.min(100, Number(payload.progress || 0))),
              determinate: payload.determinate !== false
            }
            mainWindow?.webContents.send('background-removal:progress', progress)
          }
        } catch {
          // Keep non-JSON model loader output out of the UI.
        }
      }
    })
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8')
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code !== 0 || !resultPayload || !existsSync(resultPayload.outputPath)) {
        reject(new Error(stderr.trim() || `BiRefNet 运行失败（退出码 ${code ?? 'unknown'}）。`))
        return
      }
      const buffer = readFileSync(resultPayload.outputPath)
      resolve({
        ...resultPayload,
        dataUrl: `data:image/png;base64,${buffer.toString('base64')}`
      })
    })
  })
}

async function uploadMediaWithParentType(
  config: AppConfig,
  filePath: string,
  parentType: 'bitable_image' | 'bitable_file',
  uploadName?: string
): Promise<string> {
  const token = await getTenantAccessToken(config.feishu)
  const buffer = readFileSync(filePath)
  const fileName = uploadName || basename(filePath)
  const formData = new FormData()
  formData.append('file_name', fileName)
  formData.append('parent_type', parentType)
  formData.append('parent_node', config.feishu.appToken)
  formData.append('size', String(buffer.length))
  formData.append('file', new Blob([buffer]), fileName)
  const response = await fetch('https://open.feishu.cn/open-apis/drive/v1/medias/upload_all', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData
  })
  const data = (await response.json()) as { code?: number; msg?: string; data?: { file_token?: string } }
  if (!response.ok || data.code !== 0 || !data.data?.file_token) {
    throw new Error(data.msg || '\u4e0a\u4f20\u98de\u4e66\u6210\u54c1\u56fe\u5931\u8d25\u3002')
  }
  return data.data.file_token
}

async function uploadMedia(config: AppConfig, filePath: string, uploadName?: string): Promise<string> {
  const errors: string[] = []
  for (const parentType of ['bitable_image', 'bitable_file'] as const) {
    try {
      return await uploadMediaWithParentType(config, filePath, parentType, uploadName)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      errors.push(`${parentType}: ${message}`)
    }
  }
  const permissionDenied = errors.some((message) => /permission denied/i.test(message))
  if (permissionDenied) {
    throw new Error('\u98de\u4e66\u9644\u4ef6\u4e0a\u4f20\u6743\u9650\u4e0d\u8db3\uff08Permission denied\uff09\u3002\u672c\u5730\u6210\u54c1\u5df2\u751f\u6210\uff1b\u5982\u9700\u81ea\u52a8\u5199\u5165\u6210\u54c1\u5b57\u6bb5\uff0c\u8bf7\u7ed9\u98de\u4e66\u5e94\u7528\u5f00\u901a\u201c\u4e0a\u4f20\u56fe\u7247\u548c\u9644\u4ef6\u5230\u4e91\u6587\u6863/\u7d20\u6750\u4e0a\u4f20\u201d\u76f8\u5173\u6743\u9650\u3002')
  }
  throw new Error(`\u4e0a\u4f20\u98de\u4e66\u6210\u54c1\u56fe\u5931\u8d25\uff1a${errors.join('\uff1b')}`)
}

async function uploadOne(request: UploadRequest): Promise<UploadResult> {
  const config = readConfig()
  let generatedName = ''
  let recordId = ''
  let outputPath = ''
  let localOutputGenerated = false
  try {
    requireFeishuConfig(config)
    const created = await createRecord(config, request.selections)
    recordId = created.recordId
    generatedName = await waitForGeneratedName(config, created.recordId)
    const outputExt = '.jpg'
    const uploadName = `${generatedName}${outputExt}`
    const configuredOutputDir = outputDirectory(config, request.selections.completionDate, request.item)
    const targetDir = configuredOutputDir || dirname(request.item.path)
    mkdirSync(targetDir, { recursive: true })
    const targetPath = uniquePath(join(targetDir, `${generatedName}${outputExt}`))
    outputPath = targetPath
    const tempPath = join(targetDir, `.asset-uploader-${Date.now()}-${Math.random().toString(16).slice(2)}${outputExt}`)

    await compositeImageToFile(request.item.path, request.overlays, tempPath)
    if (targetPath === request.item.path) {
      renameSync(tempPath, request.item.path)
    } else {
      renameSync(tempPath, targetPath)
      try {
        rmSync(request.item.path, { force: true })
      } catch {
        // Source cleanup is best effort. The generated final file is already safe on disk.
      }
    }
    localOutputGenerated = true

    let uploadWarning = ''
    try {
      const fileToken = await uploadMedia(config, targetPath, uploadName)
      await updateRecord(config, created.recordId, {
        [config.fieldMapping.finalAsset]: [{ file_token: fileToken }]
      })
      try {
        await updateProgressDone(config, created.recordId)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        uploadWarning = `成品已上传，进展字段未更新：${message}`
      }
    } catch (error) {
      uploadWarning = error instanceof Error ? error.message : String(error)
      try {
        await updateProgressDone(config, created.recordId)
      } catch {
        // Local output is the source of truth for the user workflow; Feishu write-back can be retried later.
      }
    }

    saveConfig({
      overlays: request.overlays,
      selections: request.selections
    })

    return {
      id: request.item.id,
      status: 'completed',
      generatedName,
      recordId: created.recordId,
      outputPath: targetPath,
      error: uploadWarning ? `本地已完成，飞书回写提醒：${uploadWarning}` : undefined
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      id: request.item.id,
      status: 'failed',
      generatedName: generatedName || undefined,
      recordId: recordId || undefined,
      outputPath: localOutputGenerated ? outputPath : undefined,
      error: localOutputGenerated ? `${message} \u672c\u5730\u6210\u54c1\u5df2\u751f\u6210\uff1a${outputPath}` : message
    }
  }
}

async function checkForUpdates(): Promise<string> {
  const config = readConfig()
  if (!config.workflow.updateUrl) {
    updateStatus = '未设置更新源地址'
    return updateStatus
  }
  if (!app.isPackaged) {
    updateStatus = '开发模式不会真正下载更新，打包后会使用该更新源'
    return updateStatus
  }
  configureAutoUpdater(config)
  updateStatus = '正在检查更新'
  await autoUpdater.checkForUpdatesAndNotify()
  return updateStatus
}

type GitHubReleaseAsset = {
  id: number
  name: string
  size: number
}

type GitHubRelease = {
  tag_name: string
  assets: GitHubReleaseAsset[]
}

function compareVersions(left: string, right: string): number {
  const leftParts = left.replace(/^v/i, '').split('.').map((part) => Number(part) || 0)
  const rightParts = right.replace(/^v/i, '').split('.').map((part) => Number(part) || 0)
  const length = Math.max(leftParts.length, rightParts.length)
  for (let index = 0; index < length; index += 1) {
    const diff = (leftParts[index] || 0) - (rightParts[index] || 0)
    if (diff !== 0) return diff
  }
  return 0
}

async function fetchGitHubLatestRelease(): Promise<GitHubRelease> {
  const response = await fetch('https://api.github.com/repos/ggone-p/poring-gameale/releases/latest', {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'poring-gameale-updater'
    }
  })
  if (!response.ok) throw new Error(`GitHub API ${response.status}`)
  return response.json() as Promise<GitHubRelease>
}

async function downloadGitHubAsset(asset: GitHubReleaseAsset): Promise<string> {
  const response = await fetch(`https://api.github.com/repos/ggone-p/poring-gameale/releases/assets/${asset.id}`, {
    headers: {
      Accept: 'application/octet-stream',
      'User-Agent': 'poring-gameale-updater'
    },
    redirect: 'follow'
  })
  if (!response.ok || !response.body) throw new Error(`GitHub asset download ${response.status}`)

  const total = Number(response.headers.get('content-length') || asset.size || 0)
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let received = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    received += value.byteLength
    const percent = total ? Math.round((received / total) * 100) : 0
    publishUpdateState('downloading', `正在下载备用更新 ${percent}%`, percent)
  }

  const installerPath = join(app.getPath('temp'), asset.name)
  writeFileSync(installerPath, Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))))
  fallbackInstallerPath = installerPath
  return installerPath
}

async function checkGitHubReleaseFallback(): Promise<string> {
  publishUpdateState('checking', '正在通过 GitHub API 检查更新')
  const release = await fetchGitHubLatestRelease()
  const latestVersion = release.tag_name.replace(/^v/i, '')
  if (compareVersions(latestVersion, app.getVersion()) <= 0) {
    publishUpdateState('not-available', '已经是最新版本')
    return updateStatus
  }

  const installer = release.assets.find((asset) => /x64\.exe$/i.test(asset.name))
  if (!installer) throw new Error('最新版本缺少 Windows 安装包')

  publishUpdateState('available', '发现新版本，正在下载备用安装包')
  await downloadGitHubAsset(installer)
  publishUpdateState('downloaded', '更新安装包已下载，点击重启安装', 100)
  return updateStatus
}

async function checkForUpdatesOnline(): Promise<string> {
  const config = readConfig()
  if (!config.workflow.updateUrl) {
    publishUpdateState('error', '未设置更新源地址')
    return updateStatus
  }
  if (!app.isPackaged) {
    publishUpdateState('idle', '开发模式不会真正下载更新，打包后会使用该更新源')
    return updateStatus
  }
  configureAutoUpdater(config)
  publishUpdateState('checking', '正在检查更新')
  try {
    await autoUpdater.checkForUpdatesAndNotify()
  } catch (error) {
    if (!config.workflow.updateUrl.includes('github.com/ggone-p/poring-gameale')) throw error
    await checkGitHubReleaseFallback()
  }
  return updateStatus
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.gamealestudio.asset-uploader')
  await startMediaServer().catch((error) => {
    console.warn('Local import server failed to start:', error)
  })
  const config = readConfig()
  configureAutoUpdater(config)
  applyLoginItemSettings(config)
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })
  createApplicationMenu()
  createWindow()
  createTray()
  if (config.workflow.autoCheckUpdates && config.workflow.updateUrl) {
    void checkForUpdatesOnline().catch((error) => {
      publishUpdateState('error', error instanceof Error ? error.message : String(error))
    })
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

app.on('before-quit', () => {
  isQuitting = true
  mediaServer?.close()
})

app.on('window-all-closed', () => {
  if (process.platform === 'darwin') return
  if (!isQuitting) createWindow()
})

autoUpdater.on('checking-for-update', () => publishUpdateState('checking', '正在检查更新'))
autoUpdater.on('update-available', () => publishUpdateState('available', '发现新版本，正在下载'))
autoUpdater.on('update-not-available', () => publishUpdateState('not-available', '已经是最新版本'))
autoUpdater.on('download-progress', (progress) =>
  publishUpdateState('downloading', `正在下载更新 ${Math.round(progress.percent)}%`, Math.round(progress.percent))
)
autoUpdater.on('update-downloaded', () => publishUpdateState('downloaded', '更新已下载，重启软件后安装', 100))
autoUpdater.on('error', (error) => publishUpdateState('error', error.message))

ipcMain.handle('config:get', () => readConfig())
ipcMain.handle('config:save', (_, patch: Partial<AppConfig>) => saveConfig(patch))
ipcMain.handle('updates:state', () => updateState)
ipcMain.handle('updates:check', async () => checkForUpdatesOnline())
ipcMain.handle('updates:install', () => {
  if (fallbackInstallerPath && existsSync(fallbackInstallerPath)) {
    void shell.openPath(fallbackInstallerPath)
    app.quit()
    return
  }
  if (app.isPackaged) autoUpdater.quitAndInstall()
})
ipcMain.handle('files:pick-images', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]
  })
  if (result.canceled) return []
  return importImages(result.filePaths)
})
ipcMain.handle('files:import-dropped', async (_, paths: string[]) => importImages(paths))
ipcMain.handle('files:import-remote-images', async (_, urls: string[]) => {
  const items: ImageItem[] = []
  for (const url of urls) items.push(await importBrowserImage({ url }))
  return items
})
ipcMain.handle('files:save-video-frame', async (_, dataUrl: string, fileName: string) => saveVideoFrame(dataUrl, fileName))
ipcMain.handle('files:media-url', (_, path: string) => mediaUrlForPath(path))
ipcMain.handle('files:pick-directory', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
  return result.canceled ? '' : result.filePaths[0]
})
ipcMain.handle('files:list-assets', (_, dir: string) => listAssets(dir))
ipcMain.handle('feishu:sync-schema', (_, tableId?: string) => syncSchema(tableId))
ipcMain.handle('upload:one', (_, request: UploadRequest) => uploadOne(request))
ipcMain.handle('compression:inspect', (_, path: string) => inspectCompressionImage(path))
ipcMain.handle('compression:preview', (_, request: CompressionPreviewRequest) => previewCompression(request))
ipcMain.handle('compression:run', (_, request: CompressionRunRequest) => runCompression(request))
ipcMain.handle('background-removal:status', () => backgroundRemovalRuntimeStatus())
ipcMain.handle('background-removal:pick-install-directory', async () => {
  const result = await dialog.showOpenDialog({
    title: '选择本地 AI 抠图环境安装位置',
    defaultPath: backgroundRemovalPaths().installDir,
    properties: ['openDirectory', 'createDirectory']
  })
  return result.canceled ? '' : result.filePaths[0]
})
ipcMain.handle('background-removal:install-runtime', (_, request: BackgroundRemovalInstallRequest) =>
  installBackgroundRemovalRuntime(request)
)
ipcMain.handle('background-removal:cancel-installation', () => cancelBackgroundRemovalInstallation())
ipcMain.handle('background-removal:run', (_, path: string) => runBackgroundRemoval(path))
ipcMain.handle('background-removal:copy-result', (_, path: string, dataUrl?: string) => {
  if (!dataUrl && (!path || !existsSync(path))) throw new Error('抠图结果不存在。')
  const image = dataUrl ? nativeImage.createFromDataURL(dataUrl) : nativeImage.createFromPath(path)
  if (image.isEmpty()) throw new Error('无法读取抠图结果。')
  clipboard.writeImage(image)
})
ipcMain.handle('background-removal:save-edit', (_, path: string, dataUrl: string) => {
  if (!path || !dataUrl.startsWith('data:image/png;base64,')) throw new Error('修补结果格式无效。')
  const buffer = Buffer.from(dataUrl.slice('data:image/png;base64,'.length), 'base64')
  writeFileSync(path, buffer)
})
ipcMain.handle('shell:show-item-in-folder', (_, path: string) => {
  if (!path || !existsSync(path)) throw new Error('成品文件不存在，可能已被移动或删除。')
  shell.showItemInFolder(path)
})
ipcMain.handle('window:prepare-collapse', () => {
  const target = resolveCollapseTarget()
  return { deltaX: target.deltaX, deltaY: target.deltaY }
})
ipcMain.handle('window:collapse', (_, options?: { deferReveal?: boolean }) => collapseWindow(options))
ipcMain.handle('window:reveal-collapsed', () => revealCollapsedWindow())
ipcMain.handle('window:expand', () => expandWindow())
ipcMain.handle(
  'window:set-mode',
  (_, mode: 'upload' | 'toolbox' | 'compression' | 'background-removal') => setWindowMode(mode)
)
ipcMain.handle('window:get-position', () => {
  if (!mainWindow) return { x: 0, y: 0 }
  const [x, y] = mainWindow.getPosition()
  return { x, y }
})
ipcMain.handle('window:set-position', (_, x: number, y: number) => {
  const nextX = Math.round(x)
  const nextY = Math.round(y)
  lastCollapsedPosition = { x: nextX, y: nextY }
  mainWindow?.setPosition(nextX, nextY, false)
  saveConfig({ window: { x: nextX, y: nextY, collapsed: true } })
})
ipcMain.handle('window:always-on-top', (_, value: boolean) => mainWindow?.setAlwaysOnTop(value))
ipcMain.handle('image:preview-composite', (_, imagePath: string, overlays: OverlayState, width: number, height: number) =>
  previewComposite(imagePath, overlays, width, height)
)
