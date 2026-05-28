import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, Tray } from 'electron'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { extname, join, dirname, basename } from 'node:path'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import sharp from 'sharp'
import type {
  AppConfig,
  AssetFile,
  BitableField,
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
import { defaultFieldMapping, defaultOverlays, defaultSelections, defaultWorkflow } from '../shared/types'

const DEFAULT_APP_TOKEN = 'FBGWbqE7YaWtlBsFr5rc8L4vnPh'
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp'])

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let tenantTokenCache: { token: string; expiresAt: number } | null = null
let isQuitting = false

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

function configPath(): string {
  return join(app.getPath('userData'), 'config.json')
}

function defaultConfig(): AppConfig {
  return {
    feishu: {
      appId: '',
      appSecret: '',
      appToken: DEFAULT_APP_TOKEN,
      tableId: ''
    },
    fieldMapping: defaultFieldMapping,
    assetLibrary: {
      logoDir: '',
      sloganDir: '',
      iconDir: ''
    },
    workflow: defaultWorkflow,
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
    return {
      ...fallback,
      ...parsed,
      feishu: { ...fallback.feishu, ...parsed.feishu },
      fieldMapping: { ...fallback.fieldMapping, ...parsed.fieldMapping },
      assetLibrary: { ...fallback.assetLibrary, ...parsed.assetLibrary },
      workflow: { ...fallback.workflow, ...parsed.workflow },
      overlays: {
        logo: { ...fallback.overlays.logo, ...parsed.overlays?.logo },
        slogan: { ...fallback.overlays.slogan, ...parsed.overlays?.slogan },
        icon: { ...fallback.overlays.icon, ...parsed.overlays?.icon }
      },
      selections: { ...fallback.selections, ...parsed.selections },
      window: { ...fallback.window, ...parsed.window }
    }
  } catch {
    return fallback
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

function todayString(): string {
  const d = new Date()
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function createWindow(): void {
  const config = readConfig()
  mainWindow = new BrowserWindow({
    width: config.window.collapsed ? 118 : 1024,
    height: config.window.collapsed ? 118 : 768,
    x: config.window.x,
    y: config.window.y,
    minWidth: 112,
    minHeight: 112,
    frame: false,
    resizable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    title: '素材悬浮上传',
    transparent: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: join(__dirname, '../preload/preload.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('moved', () => {
    if (!mainWindow) return
    const [x, y] = mainWindow.getPosition()
    saveConfig({ window: { x, y, collapsed: readConfig().window.collapsed } })
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.on('close', (event) => {
    if (isQuitting) return
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
  tray.setToolTip('素材悬浮上传')
  tray.on('click', () => expandWindow())
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '展开', click: () => expandWindow() },
      { label: '收起', click: () => collapseWindow() },
      { type: 'separator' },
      { label: '退出', click: () => app.quit() }
    ])
  )
}

function expandWindow(): void {
  if (!mainWindow) return
  mainWindow.setResizable(true)
  mainWindow.setSize(1024, 768, true)
  mainWindow.setMinimumSize(900, 680)
  mainWindow.webContents.send('window:state', 'expanded')
  saveConfig({ window: { ...readConfig().window, collapsed: false } })
}

function collapseWindow(): void {
  if (!mainWindow) return
  mainWindow.setMinimumSize(112, 112)
  mainWindow.setSize(118, 118, true)
  mainWindow.webContents.send('window:state', 'collapsed')
  saveConfig({ window: { ...readConfig().window, collapsed: true } })
}

function outputDirectory(config: AppConfig, dateText: string, item?: ImageItem): string {
  const projectDir = config.workflow.projectOutputDirs?.[config.feishu.tableId] || ''
  const projectVideoDir = config.workflow.projectVideoOutputDirs?.[config.feishu.tableId] || ''
  const baseDir = item?.sourceType === 'video-frame' ? projectVideoDir || projectDir || config.workflow.outputDir || '' : projectDir || config.workflow.outputDir || ''
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

async function uploadMedia(config: AppConfig, filePath: string, uploadName?: string): Promise<string> {
  const token = await getTenantAccessToken(config.feishu)
  const buffer = readFileSync(filePath)
  const fileName = uploadName || basename(filePath)
  const formData = new FormData()
  formData.append('file_name', fileName)
  formData.append('parent_type', 'bitable_image')
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
    throw new Error(data.msg || '上传飞书成品图失败。')
  }
  return data.data.file_token
}

async function uploadOne(request: UploadRequest): Promise<UploadResult> {
  const config = readConfig()
  try {
    requireFeishuConfig(config)
    const created = await createRecord(config, request.selections)
    const generatedName = await waitForGeneratedName(config, created.recordId)
    const sourceExt = extname(request.item.path) || '.png'
    const uploadName = `${generatedName}${sourceExt}`
    const configuredOutputDir = outputDirectory(config, request.selections.completionDate, request.item)
    const targetDir = configuredOutputDir || dirname(request.item.path)
    const targetPath = uniquePath(join(targetDir, `${generatedName}${sourceExt}`))
    const tempPath = join(app.getPath('temp'), `asset-uploader-${Date.now()}-${Math.random().toString(16).slice(2)}${sourceExt}`)

    await compositeImageToFile(request.item.path, request.overlays, tempPath)
    const fileToken = await uploadMedia(config, tempPath, uploadName)
    await updateRecord(config, created.recordId, {
      [config.fieldMapping.finalAsset]: [{ file_token: fileToken }],
      [config.fieldMapping.progress]: '已完成all'
    })

    if (targetPath === request.item.path) {
      renameSync(tempPath, request.item.path)
    } else {
      renameSync(tempPath, targetPath)
      try {
        rmSync(request.item.path, { force: true })
      } catch {
        throw new Error('飞书上传已完成，但源文件删除失败。请确认文件没有被 Photoshop 或资源管理器占用。')
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
      outputPath: targetPath
    }
  } catch (error) {
    return {
      id: request.item.id,
      status: 'failed',
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.gamealestudio.asset-uploader')
  applyLoginItemSettings(readConfig())
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })
  createWindow()
  createTray()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

app.on('before-quit', () => {
  isQuitting = true
})

app.on('window-all-closed', () => {
  if (process.platform === 'darwin') return
  if (!isQuitting) createWindow()
})

ipcMain.handle('config:get', () => readConfig())
ipcMain.handle('config:save', (_, patch: Partial<AppConfig>) => saveConfig(patch))
ipcMain.handle('files:pick-images', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]
  })
  if (result.canceled) return []
  return importImages(result.filePaths)
})
ipcMain.handle('files:import-dropped', async (_, paths: string[]) => importImages(paths))
ipcMain.handle('files:save-video-frame', async (_, dataUrl: string, fileName: string) => saveVideoFrame(dataUrl, fileName))
ipcMain.handle('files:pick-directory', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
  return result.canceled ? '' : result.filePaths[0]
})
ipcMain.handle('files:list-assets', (_, dir: string) => listAssets(dir))
ipcMain.handle('feishu:sync-schema', (_, tableId?: string) => syncSchema(tableId))
ipcMain.handle('upload:one', (_, request: UploadRequest) => uploadOne(request))
ipcMain.handle('window:collapse', () => collapseWindow())
ipcMain.handle('window:expand', () => expandWindow())
ipcMain.handle('window:get-position', () => {
  if (!mainWindow) return { x: 0, y: 0 }
  const [x, y] = mainWindow.getPosition()
  return { x, y }
})
ipcMain.handle('window:set-position', (_, x: number, y: number) => {
  mainWindow?.setPosition(Math.round(x), Math.round(y), false)
})
ipcMain.handle('window:always-on-top', (_, value: boolean) => mainWindow?.setAlwaysOnTop(value))
ipcMain.handle('image:preview-composite', (_, imagePath: string, overlays: OverlayState, width: number, height: number) =>
  previewComposite(imagePath, overlays, width, height)
)
