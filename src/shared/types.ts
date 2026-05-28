export type OverlayKind = 'logo' | 'slogan' | 'icon'

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
  organizeByMonth: boolean
  launchAtLogin: boolean
  keepInBackground: boolean
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
  organizeByMonth: true,
  launchAtLogin: true,
  keepInBackground: true
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
