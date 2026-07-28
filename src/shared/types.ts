export type OverlayKind = 'logo' | 'slogan' | 'icon'

export type BrowserImportTarget = 'upload' | 'background-removal'

export interface BrowserImportDelivery {
  items: ImageItem[]
  target: BrowserImportTarget
}

export type QueueStatus =
  | 'waiting'
  | 'creating-record'
  | 'processing'
  | 'uploading'
  | 'completed'
  | 'failed'

export interface FeishuCredentials {
  appId: string
  appSecret: string
  appToken: string
  tableId: string
}

export interface FieldMapping {
  language: string
  size: string
  assetContent: string
  detailContent: string
  designer: string
  creative: string
  completionDate: string
  fullName: string
  finalAsset: string
  progress: string
}

export interface AssetLibrary {
  logoDir: string
  sloganDir: string
  iconDir: string
}

export interface WorkflowPreferences {
  outputDir: string
  projectOutputDirs: Record<string, string>
  projectVideoOutputDirs: Record<string, string>
  groupOutputDirs: Record<'roc' | 'rorEu' | 'ror', string>
  tableOutputGroups: Record<string, 'roc' | 'rorEu' | 'ror'>
  accentColor: string
  updateUrl: string
  autoCheckUpdates: boolean
  organizeByMonth: boolean
  launchAtLogin: boolean
  keepInBackground: boolean
}

export type CompressionFormat = 'original' | 'jpeg' | 'png' | 'webp' | 'avif'
export type CompressionResizeMode = 'none' | 'longEdge' | 'exact'

export interface CompressionOptions {
  format: CompressionFormat
  quality: number
  resizeMode: CompressionResizeMode
  longEdge: number
  width: number
  height: number
  background: string
  removeMetadata: boolean
  jpegProgressive: boolean
  jpegChromaSubsampling: '4:4:4' | '4:2:0'
  pngCompressionLevel: number
  pngPalette: boolean
  webpLossless: boolean
  webpNearLossless: boolean
  webpAlphaQuality: number
  encoderEffort: number
}

export interface CompressionPreferences {
  outputDir: string
  useCustomOutputDir: boolean
  defaultOptions: CompressionOptions
  lastUsedOptions: CompressionOptions
}

export interface CompressionInspectResult {
  path: string
  fileName: string
  width: number
  height: number
  format: string
  size: number
  hasAlpha: boolean
  dataUrl: string
}

export interface CompressionPreviewRequest {
  path: string
  options: CompressionOptions
}

export interface CompressionPreviewResult {
  dataUrl: string
  size: number
  format: string
  width: number
  height: number
  warning?: string
}

export interface CompressionRunItem {
  id: string
  path: string
  options: CompressionOptions
}

export interface CompressionRunRequest {
  outputDir: string
  items: CompressionRunItem[]
}

export interface CompressionRunResult {
  id: string
  outputPath?: string
  outputSize?: number
  format?: string
  warning?: string
  error?: string
}

export interface BackgroundRemovalRuntimeStatus {
  ready: boolean
  installing: boolean
  modelDownloaded: boolean
  message: string
  installDir: string
  modelDir: string
  freeDiskBytes?: number
  nvidiaAvailable?: boolean
  version?: string
}

export type BackgroundRemovalAccelerator = 'cpu' | 'nvidia'

export interface BackgroundRemovalInstallRequest {
  installDir?: string
  accelerator: BackgroundRemovalAccelerator
}

export interface BackgroundRemovalProgress {
  phase: 'idle' | 'downloading' | 'installing' | 'verifying' | 'loading' | 'processing' | 'saving' | 'complete' | 'error'
  status: string
  percent: number
  determinate: boolean
  speedBytesPerSecond?: number
  stage?: string
  stageIndex?: number
  stageTotal?: number
  estimated?: boolean
}

export interface BackgroundRemovalResult {
  outputPath: string
  dataUrl: string
  width: number
  height: number
  size: number
  elapsedMs: number
}

export interface OverlaySettings {
  enabled: boolean
  assetPath: string
  x: number
  y: number
  scale: number
  opacity: number
  rotation: number
}

export interface OverlayState {
  logo: OverlaySettings
  slogan: OverlaySettings
  icon: OverlaySettings
}

export interface LastSelections {
  language: string
  size: string
  assetContent: string
  detailContent: string
  designer: string
  creative: string
  completionDate: string
}

export interface AppConfig {
  feishu: FeishuCredentials
  fieldMapping: FieldMapping
  assetLibrary: AssetLibrary
  workflow: WorkflowPreferences
  compression: CompressionPreferences
  backgroundRemoval: {
    installDir: string
  }
  overlays: OverlayState
  selections: LastSelections
  window: {
    x?: number
    y?: number
    collapsed: boolean
  }
}

export interface FieldOption {
  id?: string
  name: string
  color?: number
}

export interface BitableField {
  fieldId: string
  fieldName: string
  type?: number
  uiType?: string
  options: FieldOption[]
}

export interface TableInfo {
  tableId: string
  name: string
}

export interface SchemaSnapshot {
  tables: TableInfo[]
  fields: BitableField[]
}

export interface ImageItem {
  id: string
  path: string
  fileName: string
  dataUrl: string
  width: number
  height: number
  status: QueueStatus
  sourceType?: 'image' | 'video-frame'
  generatedName?: string
  recordId?: string
  outputPath?: string
  error?: string
}

export interface UploadSelections extends LastSelections {}

export interface UploadRequest {
  item: ImageItem
  selections: UploadSelections
  overlays: OverlayState
}

export interface UploadResult {
  id: string
  status: QueueStatus
  generatedName?: string
  recordId?: string
  outputPath?: string
  error?: string
}

export interface AssetFile {
  path: string
  name: string
  dataUrl?: string
}

export interface FeishuRecord {
  recordId: string
  fields: Record<string, unknown>
}

export const defaultFieldMapping: FieldMapping = {
  language: '语言',
  size: '尺寸',
  assetContent: '素材内容',
  detailContent: '细分内容',
  designer: '设计师',
  creative: '创意',
  completionDate: '完成日期',
  fullName: '素材完整命名',
  finalAsset: '成品',
  progress: '进展'
}

export const defaultOverlays: OverlayState = {
  logo: { enabled: false, assetPath: '', x: 0.78, y: 0.14, scale: 0.32, opacity: 1, rotation: 0 },
  slogan: { enabled: false, assetPath: '', x: 0.5, y: 0.82, scale: 0.46, opacity: 1, rotation: 0 },
  icon: { enabled: false, assetPath: '', x: 0.82, y: 0.18, scale: 0.24, opacity: 1, rotation: 0 }
}

export const defaultWorkflow: WorkflowPreferences = {
  outputDir: '',
  projectOutputDirs: {},
  projectVideoOutputDirs: {},
  groupOutputDirs: {
    roc: '',
    rorEu: '',
    ror: ''
  },
  tableOutputGroups: {},
  accentColor: '#fd7e8a',
  updateUrl: 'https://github.com/ggone-p/poring-gameale/releases/latest/download/',
  autoCheckUpdates: true,
  organizeByMonth: true,
  launchAtLogin: true,
  keepInBackground: true
}

export const defaultCompressionOptions: CompressionOptions = {
  format: 'webp',
  quality: 85,
  resizeMode: 'none',
  longEdge: 1600,
  width: 1080,
  height: 1080,
  background: '#ffffff',
  removeMetadata: true,
  jpegProgressive: true,
  jpegChromaSubsampling: '4:4:4',
  pngCompressionLevel: 9,
  pngPalette: false,
  webpLossless: false,
  webpNearLossless: false,
  webpAlphaQuality: 100,
  encoderEffort: 6
}

export const defaultCompression: CompressionPreferences = {
  outputDir: '',
  useCustomOutputDir: false,
  defaultOptions: defaultCompressionOptions,
  lastUsedOptions: defaultCompressionOptions
}

export const defaultSelections: LastSelections = {
  language: '',
  size: '',
  assetContent: '',
  detailContent: '',
  designer: '',
  creative: '',
  completionDate: ''
}
