import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron'
import type {
  AppConfig,
  AssetLibrary,
  CompressionInspectResult,
  CompressionPreviewRequest,
  CompressionPreviewResult,
  CompressionRunRequest,
  CompressionRunResult,
  ImageItem,
  OverlayState,
  SchemaSnapshot,
  UploadRequest,
  UploadResult
} from '../shared/types'

const api = {
  getConfig: (): Promise<AppConfig> => ipcRenderer.invoke('config:get'),
  saveConfig: (patch: Partial<AppConfig>): Promise<AppConfig> => ipcRenderer.invoke('config:save', patch),
  pickImages: (): Promise<ImageItem[]> => ipcRenderer.invoke('files:pick-images'),
  importDroppedFiles: (paths: string[]): Promise<ImageItem[]> => ipcRenderer.invoke('files:import-dropped', paths),
  importRemoteImages: (urls: string[]): Promise<ImageItem[]> => ipcRenderer.invoke('files:import-remote-images', urls),
  saveVideoFrame: (dataUrl: string, fileName: string): Promise<ImageItem> =>
    ipcRenderer.invoke('files:save-video-frame', dataUrl, fileName),
  mediaUrlForFile: (path: string): Promise<string> => ipcRenderer.invoke('files:media-url', path),
  getPathForFile: (file: File): string => webUtils.getPathForFile(file),
  pickDirectory: (): Promise<string> => ipcRenderer.invoke('files:pick-directory'),
  listAssets: (dir: string): Promise<Array<{ path: string; name: string }>> => ipcRenderer.invoke('files:list-assets', dir),
  syncSchema: (tableId?: string): Promise<SchemaSnapshot> => ipcRenderer.invoke('feishu:sync-schema', tableId),
  uploadOne: (request: UploadRequest): Promise<UploadResult> => ipcRenderer.invoke('upload:one', request),
  inspectCompressionImage: (path: string): Promise<CompressionInspectResult> =>
    ipcRenderer.invoke('compression:inspect', path),
  previewCompression: (request: CompressionPreviewRequest): Promise<CompressionPreviewResult> =>
    ipcRenderer.invoke('compression:preview', request),
  runCompression: (request: CompressionRunRequest): Promise<CompressionRunResult[]> =>
    ipcRenderer.invoke('compression:run', request),
  getUpdateState: (): Promise<{ phase: string; status: string; percent: number }> => ipcRenderer.invoke('updates:state'),
  checkForUpdates: (): Promise<string> => ipcRenderer.invoke('updates:check'),
  installUpdate: (): Promise<void> => ipcRenderer.invoke('updates:install'),
  onUpdateStatus: (callback: (state: { phase: string; status: string; percent: number }) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, state: { phase: string; status: string; percent: number }): void =>
      callback(state)
    ipcRenderer.on('updates:status', listener)
    return () => ipcRenderer.removeListener('updates:status', listener)
  },
  onBrowserImport: (callback: (items: ImageItem[]) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, items: ImageItem[]): void => callback(items)
    ipcRenderer.on('files:browser-imported', listener)
    return () => ipcRenderer.removeListener('files:browser-imported', listener)
  },
  onWindowState: (callback: (state: 'collapsed' | 'expanded') => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, state: 'collapsed' | 'expanded'): void => callback(state)
    ipcRenderer.on('window:state', listener)
    return () => ipcRenderer.removeListener('window:state', listener)
  },
  prepareCollapse: (): Promise<{ deltaX: number; deltaY: number }> => ipcRenderer.invoke('window:prepare-collapse'),
  collapse: (options?: { deferReveal?: boolean }): Promise<void> => ipcRenderer.invoke('window:collapse', options),
  revealCollapsed: (): Promise<void> => ipcRenderer.invoke('window:reveal-collapsed'),
  expand: (): Promise<void> => ipcRenderer.invoke('window:expand'),
  setWindowMode: (mode: 'upload' | 'toolbox' | 'compression'): Promise<void> => ipcRenderer.invoke('window:set-mode', mode),
  getWindowPosition: (): Promise<{ x: number; y: number }> => ipcRenderer.invoke('window:get-position'),
  setWindowPosition: (x: number, y: number): Promise<void> => ipcRenderer.invoke('window:set-position', x, y),
  setAlwaysOnTop: (value: boolean): Promise<void> => ipcRenderer.invoke('window:always-on-top', value),
  previewComposite: (
    imagePath: string,
    overlays: OverlayState,
    width: number,
    height: number
  ): Promise<string> => ipcRenderer.invoke('image:preview-composite', imagePath, overlays, width, height)
}

contextBridge.exposeInMainWorld('assetUploader', api)

declare global {
  interface Window {
    assetUploader: typeof api
  }
}
