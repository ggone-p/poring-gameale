import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type {
  AppConfig,
  AssetLibrary,
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
  saveVideoFrame: (dataUrl: string, fileName: string): Promise<ImageItem> =>
    ipcRenderer.invoke('files:save-video-frame', dataUrl, fileName),
  mediaUrlForFile: (path: string): Promise<string> => ipcRenderer.invoke('files:media-url', path),
  getPathForFile: (file: File): string => webUtils.getPathForFile(file),
  pickDirectory: (): Promise<string> => ipcRenderer.invoke('files:pick-directory'),
  listAssets: (dir: string): Promise<Array<{ path: string; name: string }>> => ipcRenderer.invoke('files:list-assets', dir),
  syncSchema: (tableId?: string): Promise<SchemaSnapshot> => ipcRenderer.invoke('feishu:sync-schema', tableId),
  uploadOne: (request: UploadRequest): Promise<UploadResult> => ipcRenderer.invoke('upload:one', request),
  collapse: (): Promise<void> => ipcRenderer.invoke('window:collapse'),
  expand: (): Promise<void> => ipcRenderer.invoke('window:expand'),
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
