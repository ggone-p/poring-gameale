import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowDownToLine,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Cloud,
  Database,
  FileImage,
  FolderOpen,
  FolderCog,
  GripVertical,
  Film,
  ImagePlus,
  ListChecks,
  Loader2,
  Minimize2,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Save,
  Settings,
  SlidersHorizontal,
  Trash2,
  Upload,
  X
} from 'lucide-react'
import type {
  AppConfig,
  AssetFile,
  BitableField,
  CompressionFormat,
  CompressionInspectResult,
  CompressionOptions,
  CompressionPreviewResult,
  CompressionResizeMode,
  CompressionRunResult,
  ImageItem,
  OverlayKind,
  OverlaySettings,
  OverlayState,
  SchemaSnapshot,
  UploadSelections
} from '../../shared/types'
import { defaultCompressionOptions, defaultOverlays } from '../../shared/types'
import poringEatSoundUrl from './assets/poring-eat.mp3'

function loadFrames(glob: Record<string, string>): string[] {
  return Object.entries(glob)
    .sort(([left], [right]) => left.localeCompare(right, undefined, { numeric: true }))
    .map(([, source]) => source)
}

const poringFrames = {
  idle: loadFrames(import.meta.glob('./assets/poring-sequence/idle/*.png', { eager: true, query: '?url', import: 'default' })),
  eat: loadFrames(import.meta.glob('./assets/poring-sequence/eat/*.png', { eager: true, query: '?url', import: 'default' })),
  click: loadFrames(import.meta.glob('./assets/poring-sequence/click/*.png', { eager: true, query: '?url', import: 'default' })),
  clickLoop: loadFrames(import.meta.glob('./assets/poring-sequence/click-loop/*.png', { eager: true, query: '?url', import: 'default' }))
}

type QueueItem = ImageItem & {
  overlays: OverlayState
  selections: UploadSelections
  touchedSelections: Partial<Record<keyof UploadSelections, boolean>>
}

const overlayLabels: Record<OverlayKind, string> = {
  logo: 'LOGO',
  slogan: '标语',
  icon: '下载icon'
}

const overlayKinds: OverlayKind[] = ['logo', 'slogan', 'icon']
const overlayPlaceholders: Record<OverlayKind, string> = {
  logo: '选择LOGO',
  slogan: '选择标语',
  icon: '选择下载icon'
}
const overlayDefaultScale: Record<OverlayKind, number> = {
  logo: 0.32,
  slogan: 0.46,
  icon: 0.24
}
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp'])
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.m4v', '.webm'])
const selectionKeys: Array<keyof UploadSelections> = [
  'language',
  'size',
  'assetContent',
  'detailContent',
  'designer',
  'creative',
  'completionDate'
]

type VideoFrameSelection = {
  id: string
  time: number
  dataUrl: string
  width: number
  height: number
}

type VideoPanelState = {
  path: string
  fileName: string
  url: string
  frames: VideoFrameSelection[]
}

type UpdateState = {
  phase: string
  status: string
  percent: number
}

type ToolView = 'upload' | 'toolbox' | 'compression'

type CompressionItem = CompressionInspectResult & {
  id: string
  options: CompressionOptions
  touched: boolean
  status: 'waiting' | 'previewing' | 'ready' | 'compressing' | 'completed' | 'failed'
  preview?: CompressionPreviewResult
  outputPath?: string
  outputSize?: number
  error?: string
  warning?: string
}

const DEFAULT_ACCENT = '#fd7e8a'
const PORING_FPS = 24
const PORING_FRAME_MS = 1000 / PORING_FPS

function cloneOverlays(overlays: OverlayState): OverlayState {
  return {
    logo: { ...overlays.logo, scale: overlayDefaultScale.logo },
    slogan: { ...overlays.slogan, scale: overlayDefaultScale.slogan },
    icon: { ...overlays.icon, scale: overlayDefaultScale.icon }
  }
}

function App(): JSX.Element {
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [schema, setSchema] = useState<SchemaSnapshot>({ tables: [], fields: [] })
  const [collapsed, setCollapsed] = useState(true)
  const [isCollapsing, setIsCollapsing] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [toolView, setToolView] = useState<ToolView>('upload')
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [selectedId, setSelectedId] = useState<string>('')
  const [detailItemId, setDetailItemId] = useState<string>('')
  const [syncing, setSyncing] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [updateStatus, setUpdateStatus] = useState('')
  const [updateState, setUpdateState] = useState<UpdateState>({ phase: 'idle', status: '', percent: 0 })
  const [videoPanel, setVideoPanel] = useState<VideoPanelState | null>(null)
  const [videoTime, setVideoTime] = useState(0)
  const [videoDuration, setVideoDuration] = useState(0)
  const [videoPaused, setVideoPaused] = useState(true)
  const [videoTimelineFrames, setVideoTimelineFrames] = useState<VideoFrameSelection[]>([])
  const [videoTimelineZoom, setVideoTimelineZoom] = useState(1)
  const [videoLoadError, setVideoLoadError] = useState('')
  const [poringMood, setPoringMood] = useState<'idle' | 'hover' | 'eating' | 'press-intro' | 'pressed'>('idle')
  const [poringFrame, setPoringFrame] = useState(0)
  const [assetFiles, setAssetFiles] = useState<Record<OverlayKind, AssetFile[]>>({
    logo: [],
    slogan: [],
    icon: []
  })
  const [compressionQueue, setCompressionQueue] = useState<CompressionItem[]>([])
  const [selectedCompressionId, setSelectedCompressionId] = useState('')
  const [compressionBusy, setCompressionBusy] = useState(false)

  useEffect(() => {
    window.assetUploader.getConfig().then((next) => {
      const accentColor =
        !next.workflow.accentColor || next.workflow.accentColor.toLowerCase() === '#0066cc'
          ? DEFAULT_ACCENT
          : next.workflow.accentColor
      const withDate = {
        ...next,
        workflow: {
          ...next.workflow,
          accentColor
        },
        selections: {
          ...next.selections,
          completionDate: todayString()
        }
      }
      setConfig(withDate)
      setCollapsed(next.window.collapsed)
    })
  }, [])

  useEffect(() => {
    return window.assetUploader.onWindowState((state) => {
      const nextCollapsed = state === 'collapsed'
      setCollapsed(nextCollapsed)
      if (nextCollapsed) setIsCollapsing(false)
    })
  }, [])

  useEffect(() => {
    if (!config) return
    void loadAssetLists(config)
  }, [config?.assetLibrary.logoDir, config?.assetLibrary.sloganDir, config?.assetLibrary.iconDir])

  useEffect(() => {
    if (!config) return
    document.documentElement.style.setProperty('--accent-color', config.workflow.accentColor || DEFAULT_ACCENT)
  }, [config?.workflow.accentColor])

  useEffect(() => {
    void window.assetUploader.getUpdateState().then((state) => {
      setUpdateState(state)
      setUpdateStatus(state.status)
    })
    return window.assetUploader.onUpdateStatus((state) => {
      setUpdateState(state)
      setUpdateStatus(state.status)
    })
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => {
      setConfig((current) => {
        if (!current) return current
        const today = todayString()
        if (current.selections.completionDate === today) return current
        setQueue((items) => items.map((item) => applyUntouchedSelections(item, { completionDate: today })))
        return {
          ...current,
          selections: {
            ...current.selections,
            completionDate: today
          }
        }
      })
    }, 60_000)
    return () => window.clearInterval(timer)
  }, [])

  const selectedItem = useMemo(
    () => queue.find((item) => item.id === selectedId) || queue[0],
    [queue, selectedId]
  )
  const detailItem = useMemo(
    () => queue.find((item) => item.id === detailItemId),
    [queue, detailItemId]
  )
  const selectedCompressionItem = useMemo(
    () => compressionQueue.find((item) => item.id === selectedCompressionId) || compressionQueue[0],
    [compressionQueue, selectedCompressionId]
  )
  const activePoringFrames = useMemo(() => {
    if (poringMood === 'eating') return poringFrames.eat
    if (poringMood === 'hover') return [poringFrames.eat[3] || poringFrames.eat[0]].filter(Boolean)
    if (poringMood === 'press-intro') return poringFrames.click
    if (poringMood === 'pressed') return poringFrames.clickLoop
    return poringFrames.idle
  }, [poringMood])
  const activePoringFrame = activePoringFrames[poringFrame % Math.max(1, activePoringFrames.length)] || ''
  const autoSyncedRef = useRef(false)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const eatAudioRef = useRef<HTMLAudioElement | null>(null)
  const moveRef = useRef<{
    pointerId: number
    startScreenX: number
    startScreenY: number
    windowX: number
    windowY: number
    moved: boolean
    dragReady: boolean
    positionReady: boolean
    longPressTimer: number
  } | null>(null)
  const dragHoverTimeoutRef = useRef<number | null>(null)

  useEffect(() => {
    eatAudioRef.current = new Audio(poringEatSoundUrl)
    eatAudioRef.current.preload = 'auto'
    return () => {
      eatAudioRef.current = null
    }
  }, [])

  useEffect(() => {
    Object.values(poringFrames)
      .flat()
      .forEach((source) => {
        const image = new Image()
        image.src = source
      })
  }, [])

  useEffect(() => {
    if (!config || autoSyncedRef.current) return
    if (!config.feishu.appId || !config.feishu.appSecret || !config.feishu.appToken) return
    autoSyncedRef.current = true
    void syncSchema()
  }, [config?.feishu.appId, config?.feishu.appSecret, config?.feishu.appToken])

  useEffect(() => {
    setPoringFrame(0)
  }, [poringMood])

  useEffect(() => {
    if (!collapsed || activePoringFrames.length <= 1) return
    const timer = window.setInterval(() => {
      setPoringFrame((frame) => frame + 1)
    }, poringMood === 'idle' ? 120 : PORING_FRAME_MS)
    return () => window.clearInterval(timer)
  }, [activePoringFrames.length, collapsed, poringMood])

  useEffect(() => {
    if (poringMood !== 'press-intro') return
    const duration = Math.max(1, poringFrames.click.length) * PORING_FRAME_MS
    const timer = window.setTimeout(() => {
      setPoringMood((current) => (current === 'press-intro' ? 'pressed' : current))
    }, duration)
    return () => window.clearTimeout(timer)
  }, [poringMood])

  useEffect(() => {
    if (!videoPanel) {
      setVideoTimelineFrames([])
      setVideoLoadError('')
      return
    }
    let cancelled = false
    setVideoLoadError('')
    setVideoTimelineFrames([])
    generateVideoTimelineFrames(videoPanel.url, 14)
      .then((frames) => {
        if (!cancelled) setVideoTimelineFrames(frames)
      })
      .catch(() => {
        if (!cancelled) setVideoTimelineFrames([])
      })
    return () => {
      cancelled = true
    }
  }, [videoPanel?.url])

  useEffect(() => {
    if (!videoPanel) return
    const video = videoRef.current
    if (!video) return
    video.load()
  }, [videoPanel?.url])

  useEffect(() => {
    if (!videoPanel) return
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'ArrowLeft' || event.key === '-') {
        event.preventDefault()
        seekVideo(-1 / 30)
      }
      if (event.key === 'ArrowRight' || event.key === '=' || event.key === '+') {
        event.preventDefault()
        seekVideo(1 / 30)
      }
      if (event.key === ' ') {
        event.preventDefault()
        const video = videoRef.current
        if (!video) return
        if (video.paused) void video.play()
        else video.pause()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [videoPanel])

  useEffect(() => {
    if (!collapsed) return
    const keepHover = (event: DragEvent): void => {
      if (!event.dataTransfer || !dataTransferHasImportableContent(event.dataTransfer)) return
      event.preventDefault()
      event.dataTransfer.dropEffect = 'copy'
      showPoringDropTarget()
    }
    const clearHover = (): void => clearPoringDropTarget()
    window.addEventListener('dragenter', keepHover)
    window.addEventListener('dragover', keepHover)
    window.addEventListener('drop', clearHover)
    return () => {
      window.removeEventListener('dragenter', keepHover)
      window.removeEventListener('dragover', keepHover)
      window.removeEventListener('drop', clearHover)
      clearPoringDropTarget()
    }
  }, [collapsed])

  const pendingUploadItems = queue.filter((item) => item.status !== 'completed')
  const allItemsReady = Boolean(
    config && queue.length && queue.every((item) => isItemReady(item, config, schema.fields))
  )
  const canUpload = Boolean(config && pendingUploadItems.length && allItemsReady && !uploading)
  const selectedCompressionOptionsKey = useMemo(
    () => (selectedCompressionItem ? JSON.stringify(selectedCompressionItem.options) : ''),
    [selectedCompressionItem?.id, selectedCompressionItem?.options]
  )

  useEffect(() => {
    if (toolView !== 'compression' || !selectedCompressionItem) return
    if (selectedCompressionItem.status === 'completed' || selectedCompressionItem.status === 'compressing') return
    const timer = window.setTimeout(() => {
      void previewCompressionItem(selectedCompressionItem)
    }, 360)
    return () => window.clearTimeout(timer)
  }, [toolView, selectedCompressionItem?.id, selectedCompressionOptionsKey])

  async function loadAssetLists(nextConfig: AppConfig): Promise<void> {
    const [logo, slogan, icon] = await Promise.all([
      window.assetUploader.listAssets(nextConfig.assetLibrary.logoDir),
      window.assetUploader.listAssets(nextConfig.assetLibrary.sloganDir),
      window.assetUploader.listAssets(nextConfig.assetLibrary.iconDir)
    ])
    setAssetFiles({ logo, slogan, icon })
  }

  async function expandPanel(nextToolView: ToolView = 'upload'): Promise<void> {
    setToolView(nextToolView)
    setCollapsed(false)
    await window.assetUploader.setWindowMode(nextToolView)
  }

  async function switchToolView(nextToolView: ToolView): Promise<void> {
    setToolView(nextToolView)
    await window.assetUploader.setWindowMode(nextToolView)
  }

  async function collapsePanel(): Promise<void> {
    setSettingsOpen(false)
    setVideoPanel(null)
    setIsCollapsing(true)
    await new Promise<void>((resolve) =>
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()))
    )
    await new Promise((resolve) => window.setTimeout(resolve, 90))
    await window.assetUploader.collapse({ deferReveal: true })
    setCollapsed(true)
    setToolView('upload')
    setIsCollapsing(false)
    await new Promise<void>((resolve) =>
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()))
    )
    await new Promise((resolve) => window.setTimeout(resolve, 48))
    await window.assetUploader.revealCollapsed()
  }

  function appendImages(items: ImageItem[]): void {
    if (!config || !items.length) return
    const additions: QueueItem[] = items.map((item) => ({
      ...item,
      overlays: cloneOverlays(config.overlays),
      selections: cloneSelections(config.selections),
      touchedSelections: {}
    }))
    setQueue((current) => [...current, ...additions])
    setSelectedId((current) => current || additions[0].id)
  }

  useEffect(() => {
    return window.assetUploader.onBrowserImport((items) => {
      appendImages(items)
      if (items.length) {
        setVideoPanel(null)
        void expandPanel()
      }
    })
  }, [config])

  async function importDroppedFiles(paths: string[]): Promise<void> {
    if (!paths.length) return
    const imagePaths = paths.filter(isImagePath)
    const videoPaths = paths.filter(isVideoPath)
    if (!imagePaths.length && !videoPaths.length) return

    if (collapsed) {
      setPoringMood('eating')
      playEatSound()
    }
    const items = imagePaths.length ? await window.assetUploader.importDroppedFiles(imagePaths) : []
    appendImages(items)
    if (imagePaths.length) {
      setVideoPanel(null)
    }
    if (videoPaths.length && !imagePaths.length) {
      void openVideoPanel(videoPaths[0])
    }
    if (items.length || videoPaths.length) {
      await new Promise((resolve) => window.setTimeout(resolve, collapsed ? 420 : 0))
      setPoringMood('idle')
      await expandPanel()
      return
    }
    setPoringMood('idle')
  }

  async function importRemoteImages(urls: string[]): Promise<void> {
    const imageUrls = urls.filter((url) => /^https?:\/\//i.test(url) || /^data:image\//i.test(url))
    if (!imageUrls.length) return
    if (collapsed) {
      setPoringMood('eating')
      playEatSound()
    }
    const items = await window.assetUploader.importRemoteImages(imageUrls)
    appendImages(items)
    if (items.length) {
      setVideoPanel(null)
      await new Promise((resolve) => window.setTimeout(resolve, collapsed ? 420 : 0))
      setPoringMood('idle')
      await expandPanel()
      return
    }
    setPoringMood('idle')
  }

  function pathsFromDrop(files: FileList | null): string[] {
    return Array.from(files || [])
      .map((file) => window.assetUploader.getPathForFile(file))
      .filter(Boolean)
  }

  function urlsFromDrop(dataTransfer: DataTransfer): string[] {
    const values = [
      dataTransfer.getData('text/uri-list'),
      dataTransfer.getData('text/plain'),
      dataTransfer.getData('URL')
    ]
    return values
      .flatMap((value) => value.split(/\r?\n/))
      .map((value) => value.trim())
      .filter((value) => value && !value.startsWith('#'))
      .filter((value, index, list) => list.indexOf(value) === index)
  }

  function dataTransferHasImportableContent(dataTransfer: DataTransfer): boolean {
    return (
      dataTransfer.types.includes('Files') ||
      dataTransfer.types.includes('text/uri-list') ||
      dataTransfer.types.includes('text/plain') ||
      dataTransfer.types.includes('URL')
    )
  }

  async function importDropPayload(dataTransfer: DataTransfer): Promise<void> {
    const paths = pathsFromDrop(dataTransfer.files)
    if (paths.length) {
      await importDroppedFiles(paths)
      return
    }
    await importRemoteImages(urlsFromDrop(dataTransfer))
  }

  async function openVideoPanel(path: string): Promise<void> {
    setSettingsOpen(false)
    setVideoTime(0)
    setVideoDuration(0)
    setVideoPaused(true)
    setVideoLoadError('')
    setVideoTimelineZoom(1)
    let url = fileUrlFromPath(path)
    try {
      url = await window.assetUploader.mediaUrlForFile(path)
    } catch {
      url = fileUrlFromPath(path)
    }
    setVideoPanel({
      path,
      fileName: fileNameFromPath(path),
      url,
      frames: []
    })
  }

  function playEatSound(): void {
    const audio = eatAudioRef.current || new Audio(poringEatSoundUrl)
    if (!audio) return
    audio.currentTime = 0
    void audio.play().catch(() => undefined)
  }

  function captureVideoFrame(): void {
    const video = videoRef.current
    if (!video || !video.videoWidth || !video.videoHeight) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const context = canvas.getContext('2d')
    if (!context) return
    context.drawImage(video, 0, 0, canvas.width, canvas.height)
    const frame: VideoFrameSelection = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      time: video.currentTime,
      dataUrl: canvas.toDataURL('image/png'),
      width: canvas.width,
      height: canvas.height
    }
    setVideoPanel((current) => (current ? { ...current, frames: [...current.frames, frame] } : current))
  }

  function seekVideo(delta: number): void {
    const video = videoRef.current
    if (!video) return
    video.currentTime = Math.max(0, Math.min(video.duration || 0, video.currentTime + delta))
  }

  function seekVideoTo(ratio: number): void {
    const video = videoRef.current
    if (!video || !video.duration) return
    video.currentTime = Math.max(0, Math.min(video.duration, video.duration * ratio))
  }

  async function exportVideoFrames(): Promise<void> {
    if (!videoPanel || !videoPanel.frames.length) return
    const baseName = videoPanel.fileName.replace(/\.[^.]+$/, '')
    const items: ImageItem[] = []
    for (let index = 0; index < videoPanel.frames.length; index += 1) {
      const frame = videoPanel.frames[index]
      const item = await window.assetUploader.saveVideoFrame(frame.dataUrl, `${baseName}-frame-${index + 1}.png`)
      items.push(item)
    }
    appendImages(items)
    if (config) {
      updateSelections({
        assetContent:
          findOption(optionsForField(schema.fields, config.fieldMapping.assetContent), ['视频截图', '视频截帧']) || '视频截图'
      })
    }
    setVideoPanel(null)
  }

  function showPoringDropTarget(): void {
    if (!collapsed || poringMood === 'eating') return
    setPoringMood('hover')
    if (dragHoverTimeoutRef.current) window.clearTimeout(dragHoverTimeoutRef.current)
    dragHoverTimeoutRef.current = window.setTimeout(() => {
      setPoringMood((current) => (current === 'hover' ? 'idle' : current))
      dragHoverTimeoutRef.current = null
    }, 1800)
  }

  function clearPoringDropTarget(): void {
    if (dragHoverTimeoutRef.current) {
      window.clearTimeout(dragHoverTimeoutRef.current)
      dragHoverTimeoutRef.current = null
    }
  }

  async function handlePoringPointerDown(event: React.PointerEvent<HTMLDivElement>): Promise<void> {
    if (event.button !== 0) return
    event.preventDefault()
    const pointerId = event.pointerId
    const longPressTimer = window.setTimeout(() => {
      const state = moveRef.current
      if (!state || state.pointerId !== pointerId) return
      state.dragReady = true
      setPoringMood('press-intro')
    }, 180)
    moveRef.current = {
      pointerId,
      startScreenX: event.screenX,
      startScreenY: event.screenY,
      windowX: 0,
      windowY: 0,
      moved: false,
      dragReady: false,
      positionReady: false,
      longPressTimer
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    const position = await window.assetUploader.getWindowPosition()
    const state = moveRef.current
    if (!state || state.pointerId !== pointerId) return
    state.windowX = position.x
    state.windowY = position.y
    state.positionReady = true
  }

  function handlePoringPointerMove(event: React.PointerEvent<HTMLDivElement>): void {
    const state = moveRef.current
    if (!state || state.pointerId !== event.pointerId) return
    if (!state.dragReady || !state.positionReady) return
    const dx = event.screenX - state.startScreenX
    const dy = event.screenY - state.startScreenY
    if (Math.abs(dx) + Math.abs(dy) > 2) state.moved = true
    if (state.moved) void window.assetUploader.setWindowPosition(state.windowX + dx, state.windowY + dy)
  }

  function handlePoringPointerUp(event: React.PointerEvent<HTMLDivElement>): void {
    const state = moveRef.current
    if (!state || state.pointerId !== event.pointerId) return
    window.clearTimeout(state.longPressTimer)
    moveRef.current = null
    if (!state.dragReady && !state.moved) void expandPanel()
    setPoringMood('idle')
  }

  function handlePoringPointerCancel(event: React.PointerEvent<HTMLDivElement>): void {
    const state = moveRef.current
    if (!state || state.pointerId !== event.pointerId) return
    window.clearTimeout(state.longPressTimer)
    moveRef.current = null
    setPoringMood('idle')
  }

  function handlePoringDragLeave(event: React.DragEvent<HTMLDivElement>): void {
    const rect = event.currentTarget.getBoundingClientRect()
    const outside =
      event.clientX <= rect.left ||
      event.clientX >= rect.right ||
      event.clientY <= rect.top ||
      event.clientY >= rect.bottom
    if (outside) {
      clearPoringDropTarget()
      setPoringMood('idle')
    }
  }

  async function pickImages(): Promise<void> {
    appendImages(await window.assetUploader.pickImages())
  }

  async function openToolbox(): Promise<void> {
    setSettingsOpen(false)
    setVideoPanel(null)
    await expandPanel('toolbox')
  }

  async function pickCompressionImages(): Promise<void> {
    const items = await window.assetUploader.pickImages()
    await addCompressionPaths(items.map((item) => item.path))
  }

  async function addCompressionPaths(paths: string[]): Promise<void> {
    if (!config) return
    const imagePaths = paths.filter(isImagePath)
    if (!imagePaths.length) return
    const options = config.compression.lastUsedOptions || config.compression.defaultOptions || defaultCompressionOptions
    const additions: CompressionItem[] = []
    for (const path of imagePaths) {
      try {
        const inspected = await window.assetUploader.inspectCompressionImage(path)
        additions.push({
          ...inspected,
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          options: { ...options },
          touched: false,
          status: 'waiting'
        })
      } catch {
        // Ignore unsupported files in mixed drops.
      }
    }
    if (!additions.length) return
    setCompressionQueue((current) => [...current, ...additions])
    setSelectedCompressionId((current) => current || additions[0].id)
  }

  function updateCompressionDefaults(patch: Partial<CompressionOptions>): void {
    if (!config) return
    const nextOptions = {
      ...config.compression.lastUsedOptions,
      ...patch
    }
    const nextConfig = {
      ...config,
      compression: {
        ...config.compression,
        lastUsedOptions: nextOptions,
        defaultOptions: nextOptions
      }
    }
    setConfig(nextConfig)
    setCompressionQueue((current) =>
      current.map((item) =>
        item.touched
          ? item
          : {
              ...item,
              options: nextOptions,
              status: item.status === 'completed' ? item.status : 'waiting',
              preview: undefined,
              error: '',
              warning: ''
            }
      )
    )
    void window.assetUploader.saveConfig({ compression: nextConfig.compression })
  }

  function applyCompressionOptionsToUntouched(): void {
    const sourceOptions =
      selectedCompressionItem?.options ||
      config?.compression.lastUsedOptions ||
      config?.compression.defaultOptions ||
      defaultCompressionOptions
    setCompressionQueue((current) =>
      current.map((item) =>
        item.touched
          ? item
          : {
              ...item,
              options: { ...sourceOptions },
              status: item.status === 'completed' ? 'waiting' : item.status,
              outputPath: undefined,
              outputSize: undefined,
              error: '',
              warning: item.warning || ''
            }
      )
    )
  }

  function updateSelectedCompressionOptions(patch: Partial<CompressionOptions>): void {
    if (!selectedCompressionItem) return
    setCompressionQueue((current) =>
      current.map((item) =>
        item.id === selectedCompressionItem.id
          ? {
              ...item,
              options: {
                ...item.options,
                ...patch
              },
              touched: true,
              status: item.status === 'completed' ? item.status : 'waiting',
              preview: undefined,
              error: '',
              warning: ''
            }
          : item
      )
    )
  }

  async function chooseCompressionOutputDir(): Promise<void> {
    if (!config) return
    const dir = await window.assetUploader.pickDirectory()
    if (!dir) return
    const nextConfig = {
      ...config,
      compression: {
        ...config.compression,
        outputDir: dir,
        useCustomOutputDir: true
      }
    }
    setConfig(nextConfig)
    await window.assetUploader.saveConfig({ compression: nextConfig.compression })
  }

  async function setCompressionUseCustomOutputDir(useCustomOutputDir: boolean): Promise<void> {
    if (!config) return
    const nextConfig = {
      ...config,
      compression: {
        ...config.compression,
        useCustomOutputDir
      }
    }
    setConfig(nextConfig)
    await window.assetUploader.saveConfig({ compression: nextConfig.compression })
  }

  async function previewCompressionItem(itemToPreview: CompressionItem): Promise<void> {
    const id = itemToPreview.id
    setCompressionQueue((current) =>
      current.map((item) => (item.id === id ? { ...item, status: 'previewing', error: '' } : item))
    )
    try {
      const preview = await window.assetUploader.previewCompression({
        path: itemToPreview.path,
        options: itemToPreview.options
      })
      setCompressionQueue((current) =>
        current.map((item) =>
          item.id === id
            ? {
                ...item,
                preview,
                status: 'ready',
                warning: preview.warning || ''
              }
            : item
        )
      )
    } catch (error) {
      setCompressionQueue((current) =>
        current.map((item) =>
          item.id === id
            ? {
                ...item,
                status: 'failed',
                error: error instanceof Error ? error.message : String(error)
              }
            : item
        )
      )
    }
  }

  async function previewSelectedCompression(): Promise<void> {
    if (!selectedCompressionItem) return
    await previewCompressionItem(selectedCompressionItem)
  }

  async function runCompression(): Promise<void> {
    if (!config || !compressionQueue.length || compressionBusy) return
    if (config.compression.useCustomOutputDir && !config.compression.outputDir) {
      alert('请先选择图片压缩的输出文件夹，或取消“指定输出文件夹”。')
      return
    }
    setCompressionBusy(true)
    const itemsToRun = compressionQueue.map((item) => ({
      id: item.id,
      path: item.path,
      options: item.options
    }))
    const outputDir = config.compression.useCustomOutputDir ? config.compression.outputDir : ''
    setCompressionQueue((current) =>
      current.map((item) => ({
        ...item,
        status: 'waiting',
        error: '',
        warning: ''
      }))
    )
    try {
      for (const itemToRun of itemsToRun) {
        setCompressionQueue((current) =>
          current.map((item) => (item.id === itemToRun.id ? { ...item, status: 'compressing', error: '', warning: '' } : item))
        )
        const [result] = await window.assetUploader.runCompression({
          outputDir,
          items: [itemToRun]
        })
        setCompressionQueue((current) =>
          current.map((item) => (item.id === itemToRun.id && result ? applyCompressionResult(item, result) : item))
        )
      }
      await window.assetUploader.saveConfig({
        compression: {
          ...config.compression,
          lastUsedOptions: config.compression.lastUsedOptions
        }
      })
    } finally {
      setCompressionBusy(false)
    }
  }

  async function syncSchema(): Promise<void> {
    setSyncing(true)
    try {
      const baseConfig = config ? await window.assetUploader.saveConfig(config) : null
      if (baseConfig) setConfig(baseConfig)

      const next = await window.assetUploader.syncSchema(baseConfig?.feishu.tableId)
      setSchema(next)
      if (baseConfig) {
        const resolved = withResolvedFieldMapping(baseConfig, next.fields)
        if (JSON.stringify(resolved.fieldMapping) !== JSON.stringify(baseConfig.fieldMapping)) {
          const saved = await window.assetUploader.saveConfig({ fieldMapping: resolved.fieldMapping })
          applyConfigDefaults(applyProjectDefaults(saved, next.fields, next.tables.find((table) => table.tableId === saved.feishu.tableId)?.name || ''))
        }
      }
      const firstProjectTable = projectTables(next.tables)[0]
      if (baseConfig && firstProjectTable && !baseConfig.feishu.tableId) {
        const updated = await window.assetUploader.saveConfig({
          feishu: { ...baseConfig.feishu, tableId: firstProjectTable.tableId },
          workflow: {
            ...baseConfig.workflow,
            tableOutputGroups: {
              ...baseConfig.workflow.tableOutputGroups,
              [firstProjectTable.tableId]: outputGroupForProject(firstProjectTable.name)
            }
          }
        })
        setConfig(updated)
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : String(error))
    } finally {
      setSyncing(false)
    }
  }

  async function selectProjectTable(tableId: string): Promise<void> {
    if (!config) return
    const table = schema.tables.find((candidate) => candidate.tableId === tableId)
    const nextConfig = await window.assetUploader.saveConfig({
      feishu: { ...config.feishu, tableId },
      workflow: {
        ...config.workflow,
        tableOutputGroups: {
          ...config.workflow.tableOutputGroups,
          [tableId]: outputGroupForProject(table?.name || '')
        }
      }
    })
    applyConfigDefaults(applyProjectDefaults(nextConfig, schema.fields, table?.name || ''))
    setSyncing(true)
    try {
      const nextSchema = await window.assetUploader.syncSchema(tableId)
      setSchema(nextSchema)
      const resolved = withResolvedFieldMapping(nextConfig, nextSchema.fields)
      const saved = await window.assetUploader.saveConfig({ fieldMapping: resolved.fieldMapping })
      applyConfigDefaults(applyProjectDefaults(saved, nextSchema.fields, table?.name || ''))
    } catch (error) {
      alert(error instanceof Error ? error.message : String(error))
    } finally {
      setSyncing(false)
    }
  }

  function applyConfigDefaults(nextConfig: AppConfig): void {
    setConfig(nextConfig)
    setQueue((current) => current.map((item) => applyUntouchedSelections(item, nextConfig.selections)))
  }

  function updateSelections(patch: Partial<UploadSelections>): void {
    if (!config) return
    setConfig({
      ...config,
      selections: {
        ...config.selections,
        ...patch
      }
    })
    setQueue((current) =>
      current.map((item) => {
        if (selectedItem && item.id === selectedItem.id) {
          const touchedSelections = { ...item.touchedSelections }
          selectionKeys.forEach((key) => {
            if (key in patch) touchedSelections[key] = true
          })
          return {
            ...item,
            selections: {
              ...item.selections,
              ...patch
            },
            touchedSelections
          }
        }
        return applyUntouchedSelections(item, patch)
      })
    )
  }

  function updateConfig(patch: Partial<AppConfig>): void {
    if (!config) return
    setConfig({
      ...config,
      ...patch,
      feishu: { ...config.feishu, ...patch.feishu },
      fieldMapping: { ...config.fieldMapping, ...patch.fieldMapping },
      assetLibrary: { ...config.assetLibrary, ...patch.assetLibrary },
      workflow: { ...config.workflow, ...patch.workflow },
      compression: {
        ...config.compression,
        ...patch.compression,
        defaultOptions: {
          ...config.compression.defaultOptions,
          ...patch.compression?.defaultOptions
        },
        lastUsedOptions: {
          ...config.compression.lastUsedOptions,
          ...patch.compression?.lastUsedOptions
        }
      },
      overlays: {
        logo: { ...config.overlays.logo, ...patch.overlays?.logo },
        slogan: { ...config.overlays.slogan, ...patch.overlays?.slogan },
        icon: { ...config.overlays.icon, ...patch.overlays?.icon }
      },
      selections: { ...config.selections, ...patch.selections },
      window: { ...config.window, ...patch.window }
    })
  }

  function updateSelectedOverlays(next: OverlayState): void {
    if (!selectedItem) return
    setQueue((current) =>
      current.map((item) =>
        item.id === selectedItem.id ? { ...item, overlays: next } : item
      )
    )
  }

  function updateOverlay(kind: OverlayKind, patch: Partial<OverlaySettings>): void {
    if (!selectedItem || !config) return
    const nextOverlay = {
      ...selectedItem.overlays[kind],
      ...patch
    }
    const shouldUpdateDefault = 'assetPath' in patch || 'enabled' in patch || 'scale' in patch
    setQueue((current) =>
      current.map((item) => {
        if (item.id === selectedItem.id) {
          return {
            ...item,
            overlays: {
              ...item.overlays,
              [kind]: nextOverlay
            }
          }
        }
        if (shouldUpdateDefault && item.status === 'waiting' && !Object.values(item.touchedSelections).some(Boolean) && !item.overlays[kind].assetPath) {
          return {
            ...item,
            overlays: {
              ...item.overlays,
              [kind]: nextOverlay
            }
          }
        }
        return item
      })
    )
    if (shouldUpdateDefault) {
      const nextConfig = {
        ...config,
        overlays: {
          ...config.overlays,
          [kind]: nextOverlay
        }
      }
      setConfig(nextConfig)
      void window.assetUploader.saveConfig({ overlays: nextConfig.overlays })
    }
  }

  async function saveSettings(): Promise<void> {
    if (!config) return
    const updated = await window.assetUploader.saveConfig(config)
    setConfig(updated)
    await loadAssetLists(updated)
    setSettingsOpen(false)
  }

  async function checkUpdatesNow(): Promise<void> {
    try {
      setUpdateStatus('正在检查更新')
      setUpdateState({ phase: 'checking', status: '正在检查更新', percent: 0 })
      const status = await window.assetUploader.checkForUpdates()
      setUpdateStatus(status)
    } catch (error) {
      const message = formatUpdateMessage(error instanceof Error ? error.message : String(error))
      setUpdateStatus(message)
      setUpdateState({ phase: 'error', status: message, percent: 0 })
    }
  }

  async function chooseAssetDir(kind: OverlayKind): Promise<void> {
    if (!config) return
    const dir = await window.assetUploader.pickDirectory()
    if (!dir) return
    updateConfig({
      assetLibrary: {
        ...config.assetLibrary,
        [`${kind}Dir`]: dir
      }
    } as Partial<AppConfig>)
  }

  async function chooseOutputDir(): Promise<void> {
    if (!config) return
    const dir = await window.assetUploader.pickDirectory()
    if (!dir) return
    updateConfig({
      workflow: {
        ...config.workflow,
        outputDir: dir
      }
    } as Partial<AppConfig>)
  }

  async function chooseGroupOutputDir(group: 'roc' | 'rorEu' | 'ror'): Promise<void> {
    if (!config) return
    const dir = await window.assetUploader.pickDirectory()
    if (!dir) return
    updateConfig({
      workflow: {
        ...config.workflow,
        groupOutputDirs: {
          ...config.workflow.groupOutputDirs,
          [group]: dir
        }
      }
    } as Partial<AppConfig>)
  }

  async function chooseProjectOutputDir(): Promise<void> {
    if (!config || !config.feishu.tableId) return
    const dir = await window.assetUploader.pickDirectory()
    if (!dir) return
    updateConfig({
      workflow: {
        ...config.workflow,
        projectOutputDirs: {
          ...config.workflow.projectOutputDirs,
          [config.feishu.tableId]: dir
        }
      }
    } as Partial<AppConfig>)
  }

  async function chooseProjectVideoOutputDir(): Promise<void> {
    if (!config || !config.feishu.tableId) return
    const dir = await window.assetUploader.pickDirectory()
    if (!dir) return
    updateConfig({
      workflow: {
        ...config.workflow,
        projectVideoOutputDirs: {
          ...config.workflow.projectVideoOutputDirs,
          [config.feishu.tableId]: dir
        }
      }
    } as Partial<AppConfig>)
  }

  async function uploadAll(): Promise<void> {
    if (!config || !queue.length) return
    const today = todayString()
    const queueForUpload = queue.map((item) => applyUntouchedSelections(item, { completionDate: today }))
    const effectiveConfig: AppConfig = {
      ...config,
      selections: {
        ...config.selections,
        completionDate: today
      }
    }
    setConfig(effectiveConfig)
    setQueue(queueForUpload)
    setUploading(true)
    await window.assetUploader.saveConfig({
      ...effectiveConfig,
      selections: effectiveConfig.selections
    })
    for (const item of queueForUpload) {
      if (item.status === 'completed') continue
      setQueue((current) =>
        current.map((entry) => (entry.id === item.id ? { ...entry, status: 'creating-record', error: '' } : entry))
      )
      const result = await window.assetUploader.uploadOne({
        item,
        selections: item.selections,
        overlays: item.overlays
      })
      setQueue((current) =>
        current.map((entry) =>
          entry.id === item.id
            ? {
                ...entry,
                status: result.status,
                generatedName: result.generatedName,
                recordId: result.recordId,
                outputPath: result.outputPath,
                error: result.error
              }
            : entry
        )
      )
    }
    setUploading(false)
  }

  if (!config) {
    return (
      <div className="boot">
        <Loader2 className="spin" size={18} />
      </div>
    )
  }

  if (collapsed) {
    return (
      <div
        className={`floating-poring ${poringMood}`}
        onDragOver={(event) => {
          event.preventDefault()
          event.dataTransfer.dropEffect = 'copy'
          showPoringDropTarget()
        }}
        onDragEnter={() => showPoringDropTarget()}
        onDragLeave={handlePoringDragLeave}
        onDrop={(event) => {
          event.preventDefault()
          clearPoringDropTarget()
          void importDropPayload(event.dataTransfer)
        }}
        onContextMenu={(event) => {
          event.preventDefault()
          window.clearTimeout(moveRef.current?.longPressTimer)
          moveRef.current = null
          setPoringMood('idle')
          void openToolbox()
        }}
        onPointerDown={(event) => void handlePoringPointerDown(event)}
        onPointerMove={handlePoringPointerMove}
        onPointerUp={handlePoringPointerUp}
        onPointerCancel={handlePoringPointerCancel}
      >
        <div className="poring-shadow" />
        <img className="poring-image" src={activePoringFrame} alt="波利AI图助手" />
      </div>
    )
  }

  return (
    <div
      className={`shell ${videoPanel ? 'video-shell' : ''} ${toolView !== 'upload' ? 'tool-shell' : ''} ${
        toolView === 'toolbox' ? 'toolbox-shell' : ''
      } ${toolView === 'compression' ? 'compression-shell' : ''} ${isCollapsing ? 'is-minimizing' : ''}`}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault()
        if (toolView === 'compression') {
          void addCompressionPaths(pathsFromDrop(event.dataTransfer.files))
          return
        }
        void importDropPayload(event.dataTransfer)
      }}
    >
      <header className="titlebar drag-region">
        {videoPanel ? (
          <div className="video-title">
            <button className="icon-btn no-drag" onClick={() => setVideoPanel(null)} title="返回主界面">
              <ArrowLeft size={18} />
            </button>
            <strong>{videoPanel.fileName}</strong>
          </div>
        ) : settingsOpen ? (
          <div className="settings-title">
            <button className="icon-btn no-drag" onClick={() => setSettingsOpen(false)} title="返回主界面">
              <ArrowLeft size={16} />
            </button>
            <div>
              <strong>设置</strong>
              <span>波利AI图助手</span>
            </div>
          </div>
        ) : toolView !== 'upload' ? (
          <div className={`tool-title ${toolView === 'compression' ? 'compression-title' : ''}`}>
            {toolView === 'toolbox' && (
            <button
              className="icon-btn no-drag"
              onClick={() => void switchToolView('upload')}
              title="返回"
            >
              <ArrowLeft size={18} />
            </button>
            )}
            <strong>{toolView === 'compression' ? '图片压缩' : 'Poli Toolbox'}</strong>
            <div>
              <strong>{toolView === 'compression' ? '图片压缩' : '波利工具箱'}</strong>
              <span>{toolView === 'compression' ? '批量压缩与单图微调' : '右键波利打开的工作流入口'}</span>
            </div>
          </div>
        ) : (
          <div className="top-context">
            <ProjectDefaults
              config={config}
              schema={schema}
              syncing={syncing}
              selections={selectedItem?.selections || config.selections}
              onProjectChange={(tableId) => void selectProjectTable(tableId)}
              onDesignerChange={(designer) => updateSelections({ designer })}
            />
          </div>
        )}
        <div className="title-actions no-drag">
          <button className="icon-btn" onClick={syncSchema} title="同步飞书字段">
            <RefreshCw size={16} className={syncing ? 'spin' : ''} />
          </button>
          {!settingsOpen && (
            <button className="icon-btn" onClick={() => setSettingsOpen(true)} title="设置">
              <Settings size={16} />
            </button>
          )}
            <button
            className="icon-btn"
            onClick={() => void collapsePanel()}
            title="收起"
          >
            <Minimize2 size={16} />
          </button>
        </div>
      </header>

      <UpdateToast state={updateState} onInstall={() => void window.assetUploader.installUpdate()} />

      {settingsOpen ? (
        <SettingsPanel
          config={config}
          schema={schema}
          syncing={syncing}
          onChange={updateConfig}
          onSave={saveSettings}
          onClose={() => setSettingsOpen(false)}
          onSync={syncSchema}
          onChooseDir={chooseAssetDir}
          onChooseOutputDir={chooseOutputDir}
          onChooseProjectOutputDir={chooseProjectOutputDir}
          onChooseProjectVideoOutputDir={chooseProjectVideoOutputDir}
          onChooseGroupOutputDir={chooseGroupOutputDir}
          updateStatus={updateStatus}
          onCheckUpdates={checkUpdatesNow}
        />
      ) : videoPanel ? (
        <VideoFramePickerStitch
          panel={videoPanel}
          videoRef={videoRef}
          currentTime={videoTime}
          duration={videoDuration}
          paused={videoPaused}
          onBack={() => setVideoPanel(null)}
          timelineFrames={videoTimelineFrames}
          timelineZoom={videoTimelineZoom}
          onTimelineZoom={setVideoTimelineZoom}
          loadError={videoLoadError}
          onLoadError={setVideoLoadError}
          onLoadedMetadata={(duration) => setVideoDuration(duration)}
          onTimeUpdate={(time) => setVideoTime(time)}
          onPlayStateChange={setVideoPaused}
          onTogglePlay={() => {
            const video = videoRef.current
            if (!video) return
            if (video.paused) {
              void video.play()
            } else {
              video.pause()
            }
          }}
          onSeek={seekVideo}
          onSeekTo={seekVideoTo}
          onCapture={captureVideoFrame}
          onRemoveFrame={(id) =>
            setVideoPanel((current) =>
              current ? { ...current, frames: current.frames.filter((frame) => frame.id !== id) } : current
            )
          }
          onClearFrames={() => setVideoPanel((current) => (current ? { ...current, frames: [] } : current))}
          onExport={() => void exportVideoFrames()}
        />
      ) : toolView === 'toolbox' ? (
        <ToolboxViewV2 onOpenCompression={() => void switchToolView('compression')} />
      ) : toolView === 'compression' ? (
        <CompressionWorkbenchReference
          config={config}
          items={compressionQueue}
          selectedItem={selectedCompressionItem}
          busy={compressionBusy}
          onSelect={setSelectedCompressionId}
          onPickImages={() => void pickCompressionImages()}
          onChooseOutputDir={() => void chooseCompressionOutputDir()}
          onUpdateDefaults={updateCompressionDefaults}
          onUpdateSelected={updateSelectedCompressionOptions}
          onApplyToUntouched={applyCompressionOptionsToUntouched}
          onToggleUseCustomOutputDir={(checked) => void setCompressionUseCustomOutputDir(checked)}
          onPreview={() => void previewSelectedCompression()}
          onRun={() => void runCompression()}
          onRemove={(id) => {
            setCompressionQueue((current) => current.filter((item) => item.id !== id))
            if (selectedCompressionId === id) setSelectedCompressionId('')
          }}
          onClear={() => {
            setCompressionQueue([])
            setSelectedCompressionId('')
          }}
        />
      ) : (
        <>
          <section className="work-area">
            <ImageQueue
              items={queue}
              config={config}
              fields={schema.fields}
              selectedId={selectedItem?.id || ''}
              uploading={uploading}
              onSelect={setSelectedId}
              onShowDetails={setDetailItemId}
              onRemove={(id) => {
                setQueue((current) => current.filter((item) => item.id !== id))
                if (selectedId === id) setSelectedId('')
                if (detailItemId === id) setDetailItemId('')
              }}
            />
            <div className="main-stage">
              <section className="stitch-stage-card">
                <div className="stage-title">
                  <strong>可选叠加</strong>
                  <button className="icon-btn" onClick={() => selectedItem && updateSelectedOverlays(cloneOverlays(defaultOverlays))} title="重置位置">
                    <RotateCcw size={14} />
                  </button>
                </div>
                <div className="canvas-stack">
                  <CanvasPreview item={selectedItem} assetFiles={assetFiles} onUpdateOverlay={updateOverlay} />
                </div>
                <OverlayControls item={selectedItem} assetFiles={assetFiles} onUpdateOverlay={updateOverlay} />
                <FieldForm
                  config={config}
                  fields={schema.fields}
                  selections={selectedItem?.selections || config.selections}
                  onChange={updateSelections}
                />
              </section>
            </div>
          </section>

          <footer className="footer">
            <div className="footer-status">
              <span className={`footer-status-icon ${allItemsReady ? 'ready' : 'pending'}`}>
                {allItemsReady ? <CheckCircle2 size={18} /> : <ListChecks size={18} />}
              </span>
              <div>
                <strong>
                  {queue.length
                    ? pendingUploadItems.length
                      ? `${pendingUploadItems.length} 张图片待处理`
                      : `${queue.length} 张图片已处理`
                    : '等待添加图片'}
                </strong>
                <small>
                  {uploading
                    ? '正在上传并重命名'
                    : queue.length
                      ? pendingUploadItems.length
                        ? allItemsReady
                          ? '全部素材已准备，可以开始上传'
                          : '补全字段和图层后开始上传'
                        : '本地成品已生成，必要时可继续补传飞书'
                      : '拖入图片或点击波利添加队列'}
                </small>
              </div>
            </div>
            <button className="primary-btn" disabled={!canUpload} onClick={uploadAll}>
              {uploading ? <Loader2 size={16} className="spin" /> : <ArrowDownToLine size={16} />}
              上传并重命名
            </button>
          </footer>
          {detailItem && <QueueDetailDialog item={detailItem} onClose={() => setDetailItemId('')} />}
        </>
      )}
    </div>
  )
}

function cloneSelections(selections: UploadSelections): UploadSelections {
  return { ...selections, detailContent: '' }
}

function applyUntouchedSelections(item: QueueItem, patch: Partial<UploadSelections>): QueueItem {
  if (Object.values(item.touchedSelections).some(Boolean)) return item
  const nextSelections = { ...item.selections }
  let changed = false
  selectionKeys.forEach((key) => {
    if (!(key in patch) || item.touchedSelections[key]) return
    const nextValue = patch[key] || ''
    if (nextSelections[key] === nextValue) return
    nextSelections[key] = nextValue
    changed = true
  })
  return changed ? { ...item, selections: nextSelections } : item
}

function formatUpdateMessage(message: string): string {
  if (/ERR_CONNECTION_CLOSED|ERR_TIMED_OUT|ERR_INTERNET_DISCONNECTED|ENOTFOUND|ECONNRESET/i.test(message)) {
    return '暂时连接不到更新源，请稍后重试，或检查当前网络是否能访问 GitHub。'
  }
  return message.replace(/^Error invoking remote method '[^']+':\s*/i, '').trim()
}

function UpdateToast({ state, onInstall }: { state: UpdateState; onInstall: () => void }): JSX.Element | null {
  if (!state.status || state.phase === 'idle' || state.phase === 'not-available') return null
  const isDownloaded = state.phase === 'downloaded'
  const isDownloading = state.phase === 'downloading'
  const isError = state.phase === 'error'
  const statusText = isError ? formatUpdateMessage(state.status) : state.status
  return (
    <aside className={`update-toast ${isError ? 'error' : ''}`}>
      <div>
        <strong>{isDownloaded ? '新版本已准备好' : '在线更新'}</strong>
        <span>{statusText}</span>
        {isDownloading && (
          <i>
            <b style={{ width: `${Math.max(4, Math.min(100, state.percent || 0))}%` }} />
          </i>
        )}
      </div>
      {isDownloaded && (
        <button className="primary-btn compact" onClick={onInstall} type="button">
          重启安装
        </button>
      )}
    </aside>
  )
}

function VideoFramePickerStitch({
  panel,
  videoRef,
  currentTime,
  duration,
  paused,
  onBack,
  timelineFrames,
  timelineZoom,
  onTimelineZoom,
  loadError,
  onLoadError,
  onLoadedMetadata,
  onTimeUpdate,
  onPlayStateChange,
  onTogglePlay,
  onSeek,
  onSeekTo,
  onCapture,
  onRemoveFrame,
  onClearFrames,
  onExport
}: {
  panel: VideoPanelState
  videoRef: React.RefObject<HTMLVideoElement>
  currentTime: number
  duration: number
  paused: boolean
  onBack: () => void
  timelineFrames: VideoFrameSelection[]
  timelineZoom: number
  onTimelineZoom: React.Dispatch<React.SetStateAction<number>>
  loadError: string
  onLoadError: (message: string) => void
  onLoadedMetadata: (duration: number) => void
  onTimeUpdate: (time: number) => void
  onPlayStateChange: (paused: boolean) => void
  onTogglePlay: () => void
  onSeek: (delta: number) => void
  onSeekTo: (ratio: number) => void
  onCapture: () => void
  onRemoveFrame: (id: string) => void
  onClearFrames: () => void
  onExport: () => void
}): JSX.Element {
  const progress = duration ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0
  const timelineItems = timelineFrames.length
    ? timelineFrames
    : Array.from({ length: 14 }, (_, index) => ({
        id: `timeline-${index}`,
        time: duration ? (duration * index) / 13 : index,
        dataUrl: '',
        width: 0,
        height: 0
      }))

  function seekFromPointer(target: HTMLElement, clientX: number): void {
    const rect = target.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    onSeekTo(ratio)
  }

  function startTimelineSeek(event: React.PointerEvent<HTMLDivElement>): void {
    event.preventDefault()
    const target = event.currentTarget
    seekFromPointer(target, event.clientX)
    const move = (moveEvent: PointerEvent): void => seekFromPointer(target, moveEvent.clientX)
    const up = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  function handleTimelineWheel(event: React.WheelEvent<HTMLDivElement>): void {
    if (!event.ctrlKey) return
    event.preventDefault()
    onTimelineZoom((current) => {
      const delta = event.deltaY < 0 ? 0.22 : -0.22
      return Math.max(1, Math.min(6, Number((current + delta).toFixed(2))))
    })
  }

  return (
    <main className="video-picker stitch-video">
      <section className="video-picker-body">
        <div className="video-top-grid">
          <section className="video-left">
            <div className="video-canvas">
              <video
                key={panel.url}
                ref={videoRef}
                crossOrigin="anonymous"
                src={panel.url}
                preload="auto"
                playsInline
                onLoadedMetadata={(event) => {
                  onLoadError('')
                  onLoadedMetadata(event.currentTarget.duration || 0)
                }}
                onLoadedData={(event) => {
                  onLoadError('')
                  onTimeUpdate(event.currentTarget.currentTime)
                }}
                onTimeUpdate={(event) => onTimeUpdate(event.currentTarget.currentTime)}
                onPlay={() => onPlayStateChange(false)}
                onPause={() => onPlayStateChange(true)}
                onError={(event) => {
                  const code = event.currentTarget.error?.code
                  const reason =
                    code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED
                      ? '视频预览没有成功加载。请先确认文件没有被占用，或换一个常规 H.264 MP4 再试。'
                      : '视频加载失败，请重试或检查文件是否可播放。'
                  onLoadError(reason)
                }}
              />
              <button className="video-play-overlay" onClick={onTogglePlay} title={paused ? '播放' : '暂停'}>
                {paused ? <Play size={42} /> : <Pause size={42} />}
              </button>
              <span className="video-timecode">{formatTime(currentTime)}</span>
              {loadError && <div className="video-load-error">{loadError}</div>}
            </div>
          </section>

          <aside className="video-frames">
            <div className="video-frames-title">
              <button className="link-btn" type="button" onClick={onClearFrames}>
                清空列表
              </button>
              <strong>已选截图 ({panel.frames.length})</strong>
              <span>素材形式默认：视频截图</span>
            </div>
            <div className="video-frame-list">
              {panel.frames.length ? (
                panel.frames.map((frame, index) => (
                  <div className={`video-frame-row ${index === panel.frames.length - 1 ? 'active' : ''}`} key={frame.id}>
                    <img src={frame.dataUrl} alt="" />
                    <div>
                      <strong>{formatTime(frame.time)}</strong>
                      <span>
                        PNG {frame.width}x{frame.height}
                      </span>
                    </div>
                    <button className="icon-btn" onClick={() => onRemoveFrame(frame.id)} title="删除截图">
                      <Trash2 size={15} />
                    </button>
                    <i>{index + 1}</i>
                  </div>
                ))
              ) : (
                <div className="video-empty">
                  <Film size={22} />
                  <span>播放到合适画面后，点击添加为截图。</span>
                </div>
              )}
            </div>
          </aside>
        </div>

        <div className="video-timeline" onWheel={handleTimelineWheel}>
          <div className="timeline-strip" onPointerDown={startTimelineSeek} style={{ width: `${timelineZoom * 100}%` }}>
            <span className="timeline-marker" style={{ left: `${progress}%` }} />
            {timelineItems.map((frame) => (
              <div
                className={`timeline-thumb ${frame.dataUrl ? '' : 'placeholder'}`}
                key={frame.id}
              >
                {frame.dataUrl ? <img src={frame.dataUrl} alt="" /> : <Film size={20} />}
                <span>{formatShortTime(frame.time)}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="video-footer stitch-video-footer">
        <div className="footer-status">
          <span className="footer-status-icon">
            <Film size={18} />
          </span>
          <div>
            <strong>
              已选择 <b>{panel.frames.length}</b> 帧，素材形式：视频截图
            </strong>
            <small>{panel.frames.length ? '生成后会回到主上传队列' : '先选择至少一帧再生成截图'}</small>
          </div>
        </div>

        <div className="video-control-row">
          <button className="plain-btn" onClick={onBack} type="button">
            取消
          </button>
          <button className="icon-btn" onClick={onTogglePlay} title={paused ? '播放' : '暂停'}>
            {paused ? <Play size={16} /> : <Pause size={16} />}
          </button>
          <button className="primary-btn capture-btn" onClick={onCapture}>
            <ImagePlus size={16} />
            添加为截图
          </button>
        </div>

        <button className="primary-btn" disabled={!panel.frames.length} onClick={onExport}>
          <Upload size={16} />
          生成截图并加入队列
        </button>
      </footer>
    </main>
  )
}

function VideoFramePicker({
  panel,
  videoRef,
  currentTime,
  duration,
  paused,
  onBack,
  onLoadedMetadata,
  onTimeUpdate,
  onPlayStateChange,
  onTogglePlay,
  onSeek,
  onSeekTo,
  onCapture,
  onRemoveFrame,
  onExport
}: {
  panel: VideoPanelState
  videoRef: React.RefObject<HTMLVideoElement>
  currentTime: number
  duration: number
  paused: boolean
  onBack: () => void
  onLoadedMetadata: (duration: number) => void
  onTimeUpdate: (time: number) => void
  onPlayStateChange: (paused: boolean) => void
  onTogglePlay: () => void
  onSeek: (delta: number) => void
  onSeekTo: (ratio: number) => void
  onCapture: () => void
  onRemoveFrame: (id: string) => void
  onExport: () => void
}): JSX.Element {
  const progress = duration ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0
  const timelineFrames = panel.frames.length
    ? panel.frames
    : Array.from({ length: 9 }, (_, index) => ({
        id: `placeholder-${index}`,
        time: duration ? (duration * index) / 8 : index,
        dataUrl: '',
        width: 0,
        height: 0
      }))
  return (
    <main className="video-picker">
      <div className="video-picker-head">
        <button className="icon-btn" onClick={onBack} title="返回上传队列">
          <ArrowLeft size={16} />
        </button>
        <div>
          <strong>{panel.fileName}</strong>
          <span>选择视频帧，生成截图后加入上传队列</span>
        </div>
      </div>

      <section className="video-picker-body">
        <div className="video-left">
          <div className="video-canvas">
            <video
              ref={videoRef}
              src={panel.url}
              onLoadedMetadata={(event) => onLoadedMetadata(event.currentTarget.duration || 0)}
              onTimeUpdate={(event) => onTimeUpdate(event.currentTarget.currentTime)}
              onPlay={() => onPlayStateChange(false)}
              onPause={() => onPlayStateChange(true)}
            />
            <button className="video-play-overlay" onClick={onTogglePlay} title={paused ? '播放' : '暂停'}>
              {paused ? <Play size={42} /> : <Pause size={42} />}
            </button>
            <span className="video-timecode">{formatTime(currentTime)}</span>
          </div>

          <div className="video-controls">
            <div className="video-progress">
              <span style={{ width: `${progress}%` }} />
            </div>
            <div className="video-control-row">
              <button className="icon-btn" onClick={onTogglePlay} title={paused ? '播放' : '暂停'}>
                {paused ? <Play size={16} /> : <Pause size={16} />}
              </button>
          <button className="primary-btn capture-btn" onClick={onCapture}>
                <ImagePlus size={16} />
                添加为截图
              </button>
            </div>
          </div>
        </div>

        <aside className="video-frames">
          <div className="video-frames-title">
            <strong>已选截图 ({panel.frames.length})</strong>
            <small>素材形式默认：视频截图</small>
          </div>
          <div className="video-frame-list">
            {panel.frames.length ? (
              panel.frames.map((frame, index) => (
                <div className="video-frame-row" key={frame.id}>
                  <img src={frame.dataUrl} alt="" />
                  <div>
                    <strong>{formatTime(frame.time)}</strong>
                    <span>
                      PNG {frame.width}x{frame.height}
                    </span>
                  </div>
                  <button className="icon-btn" onClick={() => onRemoveFrame(frame.id)} title="删除截图">
                    <Trash2 size={15} />
                  </button>
                  <i>{index + 1}</i>
                </div>
              ))
            ) : (
              <div className="video-empty">
                <Film size={22} />
                <span>播放或拖动到合适画面后，点击“添加为截图”。</span>
              </div>
            )}
          </div>
        </aside>
      </section>

      <footer className="video-footer">
        <div className="footer-status">
          <span className="footer-status-icon">
            <Film size={18} />
          </span>
          <div>
            <strong>已选择 {panel.frames.length} 帧</strong>
            <small>{panel.frames.length ? '生成后会回到主上传队列' : '先选择至少一帧再生成截图'}</small>
          </div>
        </div>
        <button className="primary-btn" disabled={!panel.frames.length} onClick={onExport}>
          <Upload size={16} />
          生成截图并加入队列
        </button>
      </footer>
    </main>
  )
}

async function generateVideoTimelineFrames(url: string, count: number): Promise<VideoFrameSelection[]> {
  const video = document.createElement('video')
  video.muted = true
  video.crossOrigin = 'anonymous'
  video.preload = 'metadata'
  const metadataReady = waitForVideoEvent(video, 'loadedmetadata')
  video.src = url
  video.load()
  await metadataReady
  const duration = Number.isFinite(video.duration) ? video.duration : 0
  if (!duration || !video.videoWidth || !video.videoHeight) return []
  const canvas = document.createElement('canvas')
  canvas.width = 180
  canvas.height = Math.max(1, Math.round((video.videoHeight / video.videoWidth) * canvas.width))
  const context = canvas.getContext('2d')
  if (!context) return []
  const frames: VideoFrameSelection[] = []
  for (let index = 0; index < count; index += 1) {
    const ratio = count <= 1 ? 0 : index / (count - 1)
    const time = Math.min(Math.max(0, duration * ratio), Math.max(0, duration - 0.04))
    video.currentTime = time
    await waitForVideoEvent(video, 'seeked')
    context.drawImage(video, 0, 0, canvas.width, canvas.height)
    frames.push({
      id: `timeline-${index}-${time.toFixed(3)}`,
      time,
      dataUrl: canvas.toDataURL('image/jpeg', 0.72),
      width: canvas.width,
      height: canvas.height
    })
  }
  video.removeAttribute('src')
  video.load()
  return frames
}

function waitForVideoEvent(video: HTMLVideoElement, eventName: 'loadedmetadata' | 'seeked'): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = (): void => {
      video.removeEventListener(eventName, handleEvent)
      video.removeEventListener('error', handleError)
    }
    const handleEvent = (): void => {
      cleanup()
      resolve()
    }
    const handleError = (): void => {
      cleanup()
      reject(new Error('视频预览生成失败'))
    }
    video.addEventListener(eventName, handleEvent, { once: true })
    video.addEventListener('error', handleError, { once: true })
  })
}

function fileExtension(path: string): string {
  const match = path.toLowerCase().match(/(\.[^.\\/]+)$/)
  return match?.[1] || ''
}

function isImagePath(path: string): boolean {
  return IMAGE_EXTENSIONS.has(fileExtension(path))
}

function isVideoPath(path: string): boolean {
  return VIDEO_EXTENSIONS.has(fileExtension(path))
}

function fileNameFromPath(path: string): string {
  return path.split(/[\\/]/).pop() || path
}

function fileUrlFromPath(path: string): string {
  return encodeURI(`file:///${path.replace(/\\/g, '/')}`)
}

function formatTime(seconds: number): string {
  const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0
  const minutes = Math.floor(safe / 60)
  const secs = Math.floor(safe % 60)
  const frames = Math.floor((safe % 1) * 30)
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}:${String(frames).padStart(2, '0')}`
}

function formatShortTime(seconds: number): string {
  const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0
  const minutes = Math.floor(safe / 60)
  const secs = Math.floor(safe % 60)
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB'
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value >= 10 || unit === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`
}

function compressionSavings(original: number, next?: number): string {
  if (!next || !original) return '待预览'
  const ratio = Math.max(-999, Math.min(100, ((original - next) / original) * 100))
  return `${ratio >= 0 ? '↓' : '↑'} ${Math.abs(ratio).toFixed(1)}%`
}

function applyCompressionResult(item: CompressionItem, result: CompressionRunResult): CompressionItem {
  if (result.error) {
    return {
      ...item,
      status: 'failed',
      error: result.error
    }
  }
  return {
    ...item,
    status: 'completed',
    outputPath: result.outputPath,
    outputSize: result.outputSize,
    warning: result.warning || item.warning || ''
  }
}

function compressionStatusText(item: CompressionItem): string {
  if (item.status === 'completed') return '已输出'
  if (item.status === 'failed') return '失败'
  if (item.status === 'compressing') return '压缩中'
  if (item.status === 'previewing') return '预览中'
  if (item.touched) return '已微调'
  return '继承默认'
}

function compressionItemProgress(status: CompressionItem['status']): number {
  if (status === 'completed') return 100
  if (status === 'failed') return 100
  if (status === 'compressing') return 72
  if (status === 'previewing') return 38
  if (status === 'ready') return 18
  return 0
}

const fieldAliases = {
  language: ['语言', '語言', 'Language'],
  size: ['尺寸', '素材尺寸', 'Size'],
  assetContent: ['素材内容', '素材內容', '素材形式', '素材类型', '素材类型/形式', '形式', '内容', 'Content'],
  detailContent: ['细分内容', '細分內容', '素材方向', '方向', '素材细分', '内容细分', '细分', 'Sub-content'],
  designer: ['设计师', '設計師', 'Designer'],
  creative: ['创意', '創意', 'Creative'],
  completionDate: ['完成日期', '日期', 'Date'],
  fullName: ['素材完整命名', '完整命名', '命名'],
  finalAsset: ['成品', '成品图', '附件'],
  progress: ['进展', '進展', '状态', 'Status']
}

function withResolvedFieldMapping(config: AppConfig, fields: BitableField[]): AppConfig {
  const fieldNames = fields.map((field) => field.fieldName)
  const next = { ...config.fieldMapping }
  ;(Object.keys(fieldAliases) as Array<keyof typeof fieldAliases>).forEach((key) => {
    if (fieldNames.includes(next[key])) return
    const resolved = resolveFieldName(fields, next[key], fieldAliases[key])
    if (resolved) next[key] = resolved
  })
  return {
    ...config,
    fieldMapping: next
  }
}

function resolveFieldName(fields: BitableField[], configured: string, aliases: string[]): string {
  const names = fields.map((field) => field.fieldName)
  if (names.includes(configured)) return configured
  for (const alias of aliases) {
    const exact = names.find((name) => name.toLowerCase() === alias.toLowerCase())
    if (exact) return exact
    const partial = names.find((name) => name.includes(alias))
    if (partial) return partial
  }
  return ''
}

function applyProjectDefaults(config: AppConfig, fields: BitableField[], projectName: string): AppConfig {
  const selections = { ...config.selections }
  const languageOptions = optionsForField(fields, config.fieldMapping.language)
  const sizeOptions = optionsForField(fields, config.fieldMapping.size)
  const designerOptions = optionsForField(fields, config.fieldMapping.designer)
  const language = defaultLanguageForProject(projectName, languageOptions)
  const size = defaultSize(sizeOptions)
  return {
    ...config,
    selections: {
      ...selections,
      language: language || selections.language,
      size: size || selections.size,
      designer: selections.designer || designerOptions[0] || '',
      completionDate: todayString()
    }
  }
}

function todayString(): string {
  return new Date().toISOString().slice(0, 10)
}

function optionsForField(fields: BitableField[], fieldName: string): string[] {
  return fields.find((field) => field.fieldName === fieldName)?.options.map((option) => option.name) || []
}

function projectTables(tables: SchemaSnapshot['tables']): SchemaSnapshot['tables'] {
  const allowedNames = ['ROR欧美平面', 'ROC平面', 'ROR平面']
  return tables.filter((table) => {
    const name = table.name.trim()
    const upper = name.toUpperCase()
    return allowedNames.some((allowed) => name.includes(allowed)) || upper.includes('GO')
  })
}

function outputGroupForProject(projectName: string): 'roc' | 'rorEu' | 'ror' {
  const upper = projectName.toUpperCase()
  if (projectName.includes('ROR欧美') || upper.includes('ROG')) return 'rorEu'
  if (upper.includes('ROC')) return 'roc'
  return 'ror'
}

function defaultLanguageForProject(projectName: string, options: string[]): string {
  const upper = projectName.toUpperCase()
  const candidates: string[] = []
  if (upper.includes('ROR欧美'.toUpperCase()) || upper.includes('ROG') || upper.includes('欧美'.toUpperCase())) candidates.push('EN')
  if (upper.includes('ROC')) candidates.push('EN')
  if (upper.includes('ROR') && !upper.includes('欧美'.toUpperCase())) candidates.push('ZH')
  if (upper.includes('GO')) candidates.push('GO', 'EN')
  candidates.push('EN', 'ZH')
  return findOption(options, candidates)
}

function defaultSize(options: string[]): string {
  return findOption(options, ['1:1', '方', 'F', 'Square', '1080x1080'])
}

function findOption(options: string[], candidates: string[]): string {
  for (const candidate of candidates) {
    const exact = options.find((option) => option.toUpperCase() === candidate.toUpperCase())
    if (exact) return exact
    const partial = options.find((option) => option.toUpperCase().includes(candidate.toUpperCase()))
    if (partial) return partial
  }
  return ''
}

function ProjectDefaults({
  config,
  schema,
  syncing,
  selections,
  onProjectChange,
  onDesignerChange
}: {
  config: AppConfig
  schema: SchemaSnapshot
  syncing: boolean
  selections: UploadSelections
  onProjectChange: (tableId: string) => void
  onDesignerChange: (designer: string) => void
}): JSX.Element {
  const designerOptions = optionsForField(schema.fields, config.fieldMapping.designer)
  const tables = projectTables(schema.tables)
  return (
    <section className="project-strip">
      <label>
        设计师
        {designerOptions.length ? (
          <select value={selections.designer} onChange={(event) => onDesignerChange(event.target.value)}>
            <option value="">选择设计师</option>
            {designerOptions.map((option) => (
              <option value={option} key={option}>
                {option}
              </option>
            ))}
          </select>
        ) : (
          <input
            value={selections.designer}
            onChange={(event) => onDesignerChange(event.target.value)}
            placeholder="默认设计师"
          />
        )}
      </label>
      <label>
        项目
        <select value={config.feishu.tableId} onChange={(event) => onProjectChange(event.target.value)}>
          <option value="">选择项目表</option>
          {tables.map((table) => (
            <option key={table.tableId} value={table.tableId}>
              {table.name}
            </option>
          ))}
        </select>
      </label>
      <span className="sync-chip">{syncing ? '同步中' : schema.fields.length ? '已同步字段' : '未同步字段'}</span>
    </section>
  )
}

function MaskedSettingInput({
  value,
  placeholder,
  onChange
}: {
  value: string
  placeholder?: string
  onChange: (value: string) => void
}): JSX.Element {
  const [focused, setFocused] = useState(false)

  return (
    <input
      className="masked-setting-input"
      type={focused ? 'text' : 'password'}
      autoComplete="off"
      spellCheck={false}
      placeholder={placeholder}
      value={value}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onChange={(event) => onChange(event.target.value)}
    />
  )
}

function ToolboxViewV2({ onOpenCompression }: { onOpenCompression: () => void }): JSX.Element {
  return (
    <main className="toolbox-view-v2">
      <div className="toolbox-inner-v2">
        <h2>所有工具</h2>

        <section className="toolbox-grid-v2">
        <button className="toolbox-card-v2 toolbox-card-primary-v2" onClick={onOpenCompression} type="button">
          <span className="toolbox-card-icon-v2">
            <SlidersHorizontal size={22} />
          </span>
          <em>可用</em>
          <strong>图片压缩</strong>
          <small>Batch compression, single image fine-tuning, side-by-side preview.</small>
          <span className="toolbox-card-action-v2">
            打开工具
            <span aria-hidden="true">→</span>
          </span>
        </button>

        <div className="toolbox-card-v2 disabled">
          <span className="toolbox-card-icon-v2">
            <Trash2 size={22} />
          </span>
          <em>开发中</em>
          <strong>背景移除</strong>
          <small>Automatically separate subjects from backgrounds with high precision.</small>
        </div>

        <div className="toolbox-card-v2 disabled">
          <span className="toolbox-card-icon-v2">
            <Minimize2 size={22} />
          </span>
          <em>开发中</em>
          <strong>AI 放大</strong>
          <small>Enhance resolution and clarity of images using advanced AI models.</small>
        </div>

        <div className="toolbox-card-v2 disabled">
          <span className="toolbox-card-icon-v2">
            <RotateCcw size={22} />
          </span>
          <em>开发中</em>
          <strong>开发中</strong>
          <small>...</small>
        </div>

          <div className="toolbox-preview-v2">
            <div className="toolbox-product-shot-v2" aria-label="波利AI图助手主界面预览">
              <div className="shot-title-v2">
                <span>FP</span>
                <strong>ROC平面 🎨</strong>
                <span>↻  ⚙  ↙</span>
              </div>
              <div className="shot-sidebar-v2">
                <strong>☁ 上传队列</strong>
                <small>暂无图片</small>
              </div>
              <div className="shot-canvas-v2">
                <span>拖入图片后显示预览</span>
              </div>
              <div className="shot-panel-v2">
                <strong>叠加图层</strong>
                <small>选择图片后可设置 Logo / Slogan / Icon</small>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}

function CompressionWorkbenchReference({
  config,
  items,
  selectedItem,
  busy,
  onSelect,
  onPickImages,
  onChooseOutputDir,
  onUpdateDefaults,
  onUpdateSelected,
  onApplyToUntouched,
  onToggleUseCustomOutputDir,
  onRun,
  onRemove,
  onClear
}: {
  config: AppConfig
  items: CompressionItem[]
  selectedItem?: CompressionItem
  busy: boolean
  onSelect: (id: string) => void
  onPickImages: () => void
  onChooseOutputDir: () => void
  onUpdateDefaults: (patch: Partial<CompressionOptions>) => void
  onUpdateSelected: (patch: Partial<CompressionOptions>) => void
  onApplyToUntouched: () => void
  onToggleUseCustomOutputDir: (checked: boolean) => void
  onPreview: () => void
  onRun: () => void
  onRemove: (id: string) => void
  onClear: () => void
}): JSX.Element {
  const [comparePosition, setComparePosition] = useState(50)
  const [viewScale, setViewScale] = useState(1)
  const defaultOptions = config.compression.lastUsedOptions || defaultCompressionOptions
  const activeOptions = selectedItem?.options || defaultOptions
  const completed = items.filter((item) => item.status === 'completed')
  const failed = items.filter((item) => item.status === 'failed')
  const finished = completed.length + failed.length
  const originalTotal = items.reduce((sum, item) => sum + item.size, 0)
  const selectedRatio = selectedItem?.preview?.size && selectedItem.size ? selectedItem.preview.size / selectedItem.size : 0
  const outputTotal = items.reduce((sum, item) => {
    if (item.outputSize) return sum + item.outputSize
    if (item.preview?.size) return sum + item.preview.size
    if (selectedRatio) return sum + Math.round(item.size * selectedRatio)
    return sum
  }, 0)
  const saving = outputTotal ? compressionSavings(originalTotal, outputTotal) : '-'
  const canRun = Boolean(items.length && !busy)
  const totalProgress = items.length ? Math.round((finished / items.length) * 100) : 0
  const imageViewStyle = { transform: `scale(${viewScale})`, transformOrigin: 'center center' }

  function zoomBy(delta: number): void {
    setViewScale((current) => Math.min(6, Math.max(0.1, Number((current + delta).toFixed(2)))))
  }

  function resetView(): void {
    setComparePosition(50)
    setViewScale(1)
  }

  function centerView(): void {
    setComparePosition(50)
  }

  useEffect(() => {
    setComparePosition(50)
    setViewScale(1)
  }, [selectedItem?.id])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      const combo = event.ctrlKey || event.metaKey
      if (!combo) return
      if (event.key === '+' || event.key === '=') {
        event.preventDefault()
        zoomBy(0.1)
      } else if (event.key === '-') {
        event.preventDefault()
        zoomBy(-0.1)
      } else if (event.key === '0') {
        event.preventDefault()
        resetView()
      } else if (event.key === '1') {
        event.preventDefault()
        setViewScale(1)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <main className="compression-reference">
      <aside className="compression-ref-queue">
        <header>
          <strong>压缩队列 ({items.length})</strong>
          <button className="icon-btn" onClick={onPickImages} type="button" title="添加图片">
            <ImagePlus size={16} />
          </button>
        </header>

        <button className="compression-ref-drop" onClick={onPickImages} type="button">
          <Upload size={26} />
          <strong>拖入或选择图片</strong>
          <small>Supports PNG, JPG, WebP</small>
        </button>

        <div className="compression-ref-list">
          {items.length === 0 ? (
            <div className="compression-empty-copy">把要压缩的图片拖进窗口，或点击上方区域选择文件。</div>
          ) : (
            items.map((item) => (
              <div
                className={`compression-ref-row ${selectedItem?.id === item.id ? 'active' : ''} ${
                  item.status === 'compressing' ? 'is-compressing' : ''
                }`}
                key={item.id}
                onClick={() => onSelect(item.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') onSelect(item.id)
                }}
              >
                <img src={item.dataUrl} alt="" />
                <span>
                  <strong>{item.fileName}</strong>
                  <small>
                    {formatBytes(item.size)}
                    {item.touched ? <b>已微调</b> : <b>继承默认</b>}
                  </small>
                </span>
                <div className="compression-row-progress">
                  <i style={{ width: `${compressionItemProgress(item.status)}%` }} />
                </div>
                <button
                  className="queue-remove-btn"
                  onClick={(event) => {
                    event.stopPropagation()
                    onRemove(item.id)
                  }}
                  type="button"
                  title="移除"
                >
                  <X size={13} />
                </button>
              </div>
            ))
          )}
        </div>
      </aside>

      <section className="compression-ref-canvas">
        {selectedItem && (
          <div className="compression-ref-file-chip">
            <strong>{selectedItem.fileName}</strong>
            <span>
              {selectedItem.width}x{selectedItem.height} · {selectedItem.format.toUpperCase()} · {formatBytes(selectedItem.size)}
            </span>
          </div>
        )}

        {selectedItem ? (
          <div className="compression-ref-image">
            {selectedItem.preview ? (
              <>
                <img className="compare-compressed-base-v2" src={selectedItem.preview.dataUrl} style={imageViewStyle} alt="" />
                <div className="compare-original-pane-v2" style={{ clipPath: `inset(0 ${100 - comparePosition}% 0 0)` }}>
                  <img src={selectedItem.dataUrl} style={imageViewStyle} alt="" />
                </div>
                <span className="compare-label-v2 compare-label-original-v2">原图</span>
                <span className="compare-label-v2 compare-label-compressed-v2">压缩后</span>
              </>
            ) : (
              <>
                <img className="compare-original-base-v2" src={selectedItem.dataUrl} style={imageViewStyle} alt="" />
                <div className="compare-loading-v2">
                  <Loader2 className="spin" size={22} />
                  正在生成压缩预览
                </div>
              </>
            )}
            <div className="compare-axis-v2" style={{ left: `${comparePosition}%` }}>
              <span>
                <ChevronDown size={16} />
                <ChevronDown size={16} />
              </span>
            </div>
            <input
              className="compare-slider-v2"
              type="range"
              min="0"
              max="100"
              value={comparePosition}
              onChange={(event) => setComparePosition(Number(event.target.value))}
              aria-label="左右拖动查看压缩效果"
            />
            <div className="compression-ref-toolbar">
              <button onClick={() => zoomBy(-0.1)} type="button" title="缩小 Ctrl+-">−</button>
              <span>{Math.round(viewScale * 100)}%</span>
              <button onClick={() => zoomBy(0.1)} type="button" title="放大 Ctrl++">+</button>
              <button onClick={resetView} type="button" title="还原 Ctrl+0">↻</button>
              <button onClick={centerView} type="button" title="居中分割线">○</button>
              <button onClick={() => setViewScale(1)} type="button" title="适合画布 Ctrl+1">▦</button>
            </div>
            <div className="compression-ref-saving">
              <strong>{selectedItem.preview ? compressionSavings(selectedItem.size, selectedItem.preview.size) : '↓ 0%'}</strong>
              <span>{selectedItem.preview ? formatBytes(selectedItem.preview.size) : '-'}</span>
            </div>
          </div>
        ) : (
          <div className="compression-ref-empty">
            <FileImage size={34} />
            <span>拖入图片后显示压缩预览</span>
          </div>
        )}
      </section>

      <aside className="compression-ref-settings">
        <header>
          <strong>压缩设置</strong>
        </header>
        <CompressionOptionsFormReference
          options={activeOptions}
          hasAlpha={Boolean(selectedItem?.hasAlpha)}
          outputDir={config.compression.outputDir}
          useCustomOutputDir={config.compression.useCustomOutputDir}
          onChooseOutputDir={onChooseOutputDir}
          onToggleUseCustomOutputDir={onToggleUseCustomOutputDir}
          onChange={selectedItem ? onUpdateSelected : onUpdateDefaults}
        />
      </aside>

      <footer className="compression-ref-footer">
        <div className="compression-ref-stats">
          <span>总数：{items.length}</span>
          <span>已输出：{completed.length}</span>
          <span>总原始：{formatBytes(originalTotal)}</span>
          <span>→</span>
          <strong>压缩后：{outputTotal ? formatBytes(outputTotal) : '计算中'}</strong>
          <b>{saving}</b>
          <span className="compression-total-progress" aria-label={`总进度 ${totalProgress}%`}>
            <i style={{ width: `${totalProgress}%` }} />
          </span>
        </div>
        <div className="compression-ref-actions">
          <button className="secondary-btn" disabled={!selectedItem || !items.length} onClick={onApplyToUntouched} type="button">
            应用到全部未微调图片
          </button>
          <button className="primary-btn" disabled={!canRun} onClick={onRun} type="button">
            {busy ? <Loader2 className="spin" size={16} /> : <ArrowDownToLine size={16} />}
            开始压缩
          </button>
        </div>
      </footer>
    </main>
  )
}

function CompressionOptionsFormReference({
  options,
  hasAlpha,
  outputDir,
  useCustomOutputDir,
  onChooseOutputDir,
  onToggleUseCustomOutputDir,
  onChange
}: {
  options: CompressionOptions
  hasAlpha: boolean
  outputDir: string
  useCustomOutputDir: boolean
  onChooseOutputDir: () => void
  onToggleUseCustomOutputDir: (checked: boolean) => void
  onChange: (patch: Partial<CompressionOptions>) => void
}): JSX.Element {
  return (
    <div className="compression-ref-options">
      <section>
        <h3>基础参数</h3>
        <label>
          输出格式
          <select value={options.format} onChange={(event) => onChange({ format: event.target.value as CompressionFormat })}>
            <option value="original">保持原格式</option>
            <option value="jpeg">JPG</option>
            <option value="png">PNG</option>
            <option value="webp">WebP（推荐）</option>
            <option value="avif">AVIF</option>
          </select>
        </label>
        {hasAlpha && options.format === 'jpeg' && <p className="compression-hint-v2">这张图有透明通道，转 JPG 会合成背景色。</p>}
        <label>
          <span className="form-line-v2">
            压缩质量
            <b>{options.quality}%</b>
          </span>
          <input
            type="range"
            min="1"
            max="100"
            value={options.quality}
            onChange={(event) => onChange({ quality: Number(event.target.value) })}
          />
        </label>
        <label>
          尺寸调整
          <select value={options.resizeMode} onChange={(event) => onChange({ resizeMode: event.target.value as CompressionResizeMode })}>
            <option value="none">保持原尺寸</option>
            <option value="longEdge">限制最长边</option>
            <option value="exact">限制宽高范围</option>
          </select>
        </label>
        {options.resizeMode === 'longEdge' && (
          <label>
            最长边
            <input type="number" min="16" value={options.longEdge} onChange={(event) => onChange({ longEdge: Number(event.target.value) })} />
          </label>
        )}
        {options.resizeMode === 'exact' && (
          <div className="compression-size-pair">
            <label>
              宽度
              <input type="number" min="16" value={options.width} onChange={(event) => onChange({ width: Number(event.target.value) })} />
            </label>
            <label>
              高度
              <input type="number" min="16" value={options.height} onChange={(event) => onChange({ height: Number(event.target.value) })} />
            </label>
          </div>
        )}
        <label>
          透明转 JPG 背景
          <span className="color-field">
            <input type="color" value={options.background} onChange={(event) => onChange({ background: event.target.value })} />
            默认白色
          </span>
        </label>
      </section>

      <div className="compression-ref-output">
        <label className="settings-check output-mode-check">
          <input
            type="checkbox"
            checked={useCustomOutputDir}
            onChange={(event) => onToggleUseCustomOutputDir(event.target.checked)}
          />
          <span>指定输出文件夹</span>
        </label>
        <label>
          输出目录
          <div className="settings-path-row">
            <input readOnly value={useCustomOutputDir ? outputDir || '请选择输出文件夹' : '默认：每张源图片旁新建 output 文件夹'} />
            <button className="icon-btn" disabled={!useCustomOutputDir} onClick={onChooseOutputDir} type="button" title="选择输出目录">
              <FolderOpen size={15} />
            </button>
          </div>
        </label>
      </div>

      <details className="advanced-options-v2">
        <summary>进阶参数</summary>
        <div className="advanced-grid-v2">
          <label className="settings-check">
            <input
              type="checkbox"
              checked={options.removeMetadata}
              onChange={(event) => onChange({ removeMetadata: event.target.checked })}
            />
            <span>移除元数据</span>
          </label>
          <label className="settings-check">
            <input
              type="checkbox"
              checked={options.webpLossless}
              onChange={(event) => onChange({ webpLossless: event.target.checked })}
            />
            <span>无损压缩</span>
          </label>
          <label className="settings-check">
            <input
              type="checkbox"
              checked={options.jpegProgressive}
              onChange={(event) => onChange({ jpegProgressive: event.target.checked })}
            />
            <span>JPEG 渐进加载</span>
          </label>
          <label>
            JPEG 色度采样
            <select
              value={options.jpegChromaSubsampling}
              onChange={(event) => onChange({ jpegChromaSubsampling: event.target.value as CompressionOptions['jpegChromaSubsampling'] })}
            >
              <option value="4:2:0">4:2:0</option>
              <option value="4:4:4">4:4:4</option>
            </select>
          </label>
          <label>
            PNG 压缩等级 {options.pngCompressionLevel}
            <input
              type="range"
              min="0"
              max="9"
              value={options.pngCompressionLevel}
              onChange={(event) => onChange({ pngCompressionLevel: Number(event.target.value) })}
            />
          </label>
          <label>
            编码强度 {options.encoderEffort}
            <input
              type="range"
              min="0"
              max="9"
              value={options.encoderEffort}
              onChange={(event) => onChange({ encoderEffort: Number(event.target.value) })}
            />
          </label>
          <button className="restore-default-btn" onClick={() => onChange(defaultCompressionOptions)} type="button">
            ↻ 恢复默认
          </button>
        </div>
      </details>
    </div>
  )
}

function CompressionWorkbenchV2({
  config,
  items,
  selectedItem,
  busy,
  onSelect,
  onPickImages,
  onChooseOutputDir,
  onUpdateDefaults,
  onUpdateSelected,
  onRun,
  onRemove,
  onClear
}: {
  config: AppConfig
  items: CompressionItem[]
  selectedItem?: CompressionItem
  busy: boolean
  onSelect: (id: string) => void
  onPickImages: () => void
  onChooseOutputDir: () => void
  onUpdateDefaults: (patch: Partial<CompressionOptions>) => void
  onUpdateSelected: (patch: Partial<CompressionOptions>) => void
  onPreview: () => void
  onRun: () => void
  onRemove: (id: string) => void
  onClear: () => void
}): JSX.Element {
  const [comparePosition, setComparePosition] = useState(50)
  const defaultOptions = config.compression.lastUsedOptions || defaultCompressionOptions
  const activeOptions = selectedItem?.options || defaultOptions
  const completed = items.filter((item) => item.status === 'completed')
  const originalTotal = items.reduce((sum, item) => sum + item.size, 0)
  const outputTotal = items.reduce((sum, item) => sum + (item.outputSize || item.preview?.size || 0), 0)
  const canRun = Boolean(items.length && !busy)

  return (
    <main className="compression-workbench-v2">
      <aside className="compression-queue-v2">
        <header>
          <div>
            <strong>压缩队列</strong>
            <span>{items.length} 张图片</span>
          </div>
          {items.length > 0 && (
            <button className="text-link-btn" onClick={onClear} type="button">
              清空
            </button>
          )}
        </header>

        <button className="compression-drop-v2" onClick={onPickImages} type="button">
          <ImagePlus size={24} />
          <strong>拖入或选择图片</strong>
          <small>PNG / JPG / WebP</small>
        </button>

        <div className="compression-list-v2">
          {items.length === 0 ? (
            <div className="compression-empty-copy">右键波利进入工具箱后，把要压缩的图片拖进这里。</div>
          ) : (
            items.map((item) => (
              <div
                className={`compression-row-v2 ${selectedItem?.id === item.id ? 'active' : ''}`}
                key={item.id}
                onClick={() => onSelect(item.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') onSelect(item.id)
                }}
              >
                <img src={item.dataUrl} alt="" />
                <span>
                  <strong>{item.fileName}</strong>
                  <small>{formatBytes(item.size)} · {compressionStatusText(item)}</small>
                </span>
                {item.touched && <b>已微调</b>}
                <button
                  className="queue-remove-btn"
                  onClick={(event) => {
                    event.stopPropagation()
                    onRemove(item.id)
                  }}
                  type="button"
                  title="移除"
                >
                  <X size={13} />
                </button>
              </div>
            ))
          )}
        </div>
      </aside>

      <section className="compression-preview-v2">
        {selectedItem ? (
          <>
            <div className="compression-preview-title-v2">
              <div>
                <strong>{selectedItem.fileName}</strong>
                <small>
                  {selectedItem.width}x{selectedItem.height} · {selectedItem.format.toUpperCase()} · {formatBytes(selectedItem.size)}
                </small>
              </div>
              <span className={`auto-preview-chip-v2 ${selectedItem.status === 'previewing' ? 'running' : ''}`}>
                {selectedItem.status === 'previewing' ? <Loader2 className="spin" size={14} /> : <SlidersHorizontal size={14} />}
                自动预览
              </span>
            </div>

            <div className="compare-stage-v2">
              <div className="compare-image-shell-v2">
                <img className="compare-original-v2" src={selectedItem.dataUrl} alt="" />
                {selectedItem.preview ? (
                  <div className="compare-compressed-v2" style={{ clipPath: `inset(0 ${100 - comparePosition}% 0 0)` }}>
                    <img src={selectedItem.preview.dataUrl} alt="" />
                  </div>
                ) : (
                  <div className="compare-loading-v2">
                    <Loader2 className="spin" size={22} />
                    正在生成压缩预览
                  </div>
                )}
                <div className="compare-axis-v2" style={{ left: `${comparePosition}%` }}>
                  <span>
                    <ChevronDown size={16} />
                    <ChevronDown size={16} />
                  </span>
                </div>
                <input
                  className="compare-slider-v2"
                  type="range"
                  min="0"
                  max="100"
                  value={comparePosition}
                  onChange={(event) => setComparePosition(Number(event.target.value))}
                  aria-label="左右拖动查看压缩效果"
                />
                <div className="compare-pill-v2 original">
                  <strong>Original</strong>
                  <span>{formatBytes(selectedItem.size)}</span>
                </div>
                <div className="compare-pill-v2 compressed">
                  <strong>{selectedItem.preview?.format?.toUpperCase() || activeOptions.format.toUpperCase()}</strong>
                  <span>
                    {selectedItem.preview
                      ? `${formatBytes(selectedItem.preview.size)} · ${compressionSavings(selectedItem.size, selectedItem.preview.size)}`
                      : '计算中'}
                  </span>
                </div>
              </div>
            </div>

            {(selectedItem.warning || selectedItem.error) && (
              <p className={`compression-message-v2 ${selectedItem.error ? 'bad' : ''}`}>
                {selectedItem.error || selectedItem.warning}
              </p>
            )}
          </>
        ) : (
          <div className="compression-empty-stage-v2">
            <FileImage size={28} />
            <strong>把图片加入队列后开始压缩</strong>
            <span>这里会自动显示原图和压缩预览。</span>
          </div>
        )}
      </section>

      <aside className="compression-settings-v2">
        <header>
          <strong>Edit</strong>
          <span>{selectedItem?.touched ? '单图已微调' : '默认参数'}</span>
        </header>
        <CompressionOptionsFormV2
          options={activeOptions}
          hasAlpha={Boolean(selectedItem?.hasAlpha)}
          onChange={selectedItem ? onUpdateSelected : onUpdateDefaults}
        />
        <div className="compression-output-v2">
          <label>
            输出目录
            <div className="settings-path-row">
              <input readOnly value={config.compression.outputDir || '未设置，压缩前请选择'} />
              <button className="icon-btn" onClick={onChooseOutputDir} type="button">
                <FolderOpen size={15} />
              </button>
            </div>
          </label>
        </div>
      </aside>

      <footer className="compression-footer-v2">
        <div className="footer-status">
          <span className={`footer-status-icon ${canRun ? 'ready' : 'pending'}`}>
            {canRun ? <CheckCircle2 size={18} /> : <ListChecks size={18} />}
          </span>
          <div>
            <strong>
              {items.length ? `${items.length} 张图片待压缩` : '等待添加图片'}
              {completed.length ? `，${completed.length} 张已输出` : ''}
            </strong>
            <small>
              {items.length
                ? `原图 ${formatBytes(originalTotal)}，预计输出 ${outputTotal ? formatBytes(outputTotal) : '计算中'}`
                : '拖入图片或点击左侧按钮添加到队列'}
            </small>
          </div>
        </div>
        <button className="primary-btn" disabled={!canRun} onClick={onRun} type="button">
          {busy ? <Loader2 className="spin" size={16} /> : <ArrowDownToLine size={16} />}
          开始压缩
        </button>
      </footer>
    </main>
  )
}

function CompressionOptionsFormV2({
  options,
  hasAlpha,
  onChange
}: {
  options: CompressionOptions
  hasAlpha: boolean
  onChange: (patch: Partial<CompressionOptions>) => void
}): JSX.Element {
  return (
    <div className="compression-options-v2">
      <div className="compress-section-v2">
        <h3>Compress</h3>
        <label>
          输出格式
          <select value={options.format} onChange={(event) => onChange({ format: event.target.value as CompressionFormat })}>
            <option value="original">保持原格式</option>
            <option value="jpeg">JPG</option>
            <option value="png">PNG</option>
            <option value="webp">WebP</option>
            <option value="avif">AVIF</option>
          </select>
        </label>
        {hasAlpha && options.format === 'jpeg' && <p className="compression-hint-v2">这张图有透明通道，转 JPG 会合成背景色。</p>}
        <label>
          <span className="form-line-v2">
            质量
            <b>{options.quality}</b>
          </span>
          <input
            type="range"
            min="1"
            max="100"
            value={options.quality}
            onChange={(event) => onChange({ quality: Number(event.target.value) })}
          />
        </label>
        <label>
          尺寸
          <select value={options.resizeMode} onChange={(event) => onChange({ resizeMode: event.target.value as CompressionResizeMode })}>
            <option value="none">保持原尺寸</option>
            <option value="longEdge">限制最长边</option>
            <option value="exact">指定宽高内适配</option>
          </select>
        </label>
        {options.resizeMode === 'longEdge' && (
          <label>
            最长边
            <input type="number" min="16" value={options.longEdge} onChange={(event) => onChange({ longEdge: Number(event.target.value) })} />
          </label>
        )}
        {options.resizeMode === 'exact' && (
          <div className="compression-size-pair">
            <label>
              宽
              <input type="number" min="16" value={options.width} onChange={(event) => onChange({ width: Number(event.target.value) })} />
            </label>
            <label>
              高
              <input type="number" min="16" value={options.height} onChange={(event) => onChange({ height: Number(event.target.value) })} />
            </label>
          </div>
        )}
        <label>
          透明转 JPG 背景
          <input type="color" value={options.background} onChange={(event) => onChange({ background: event.target.value })} />
        </label>
      </div>

      <details className="advanced-options-v2" open>
        <summary>进阶参数</summary>
        <div className="advanced-grid-v2">
          <label className="settings-check">
            <input
              type="checkbox"
              checked={options.removeMetadata}
              onChange={(event) => onChange({ removeMetadata: event.target.checked })}
            />
            <span>移除 EXIF / metadata</span>
          </label>
          <label className="settings-check">
            <input
              type="checkbox"
              checked={options.jpegProgressive}
              onChange={(event) => onChange({ jpegProgressive: event.target.checked })}
            />
            <span>JPEG 渐进渲染</span>
          </label>
          <label>
            JPEG 色度采样
            <select
              value={options.jpegChromaSubsampling}
              onChange={(event) => onChange({ jpegChromaSubsampling: event.target.value as CompressionOptions['jpegChromaSubsampling'] })}
            >
              <option value="4:2:0">4:2:0 体积优先</option>
              <option value="4:4:4">4:4:4 细节优先</option>
            </select>
          </label>
          <label>
            PNG 压缩等级 {options.pngCompressionLevel}
            <input
              type="range"
              min="0"
              max="9"
              value={options.pngCompressionLevel}
              onChange={(event) => onChange({ pngCompressionLevel: Number(event.target.value) })}
            />
          </label>
          <label className="settings-check">
            <input
              type="checkbox"
              checked={options.pngPalette}
              onChange={(event) => onChange({ pngPalette: event.target.checked })}
            />
            <span>PNG 调色板压缩</span>
          </label>
          <label className="settings-check">
            <input
              type="checkbox"
              checked={options.webpLossless}
              onChange={(event) => onChange({ webpLossless: event.target.checked })}
            />
            <span>WebP / AVIF 无损</span>
          </label>
          <label className="settings-check">
            <input
              type="checkbox"
              checked={options.webpNearLossless}
              onChange={(event) => onChange({ webpNearLossless: event.target.checked })}
            />
            <span>WebP 近似无损</span>
          </label>
          <label>
            WebP Alpha 质量 {options.webpAlphaQuality}
            <input
              type="range"
              min="0"
              max="100"
              value={options.webpAlphaQuality}
              onChange={(event) => onChange({ webpAlphaQuality: Number(event.target.value) })}
            />
          </label>
          <label>
            Encoder Effort {options.encoderEffort}
            <input
              type="range"
              min="0"
              max="9"
              value={options.encoderEffort}
              onChange={(event) => onChange({ encoderEffort: Number(event.target.value) })}
            />
          </label>
        </div>
      </details>
    </div>
  )
}

function ToolboxView({ onOpenCompression }: { onOpenCompression: () => void }): JSX.Element {
  return (
    <main className="toolbox-view">
      <section className="toolbox-hero">
        <span className="toolbox-kicker">Poring Utility</span>
        <h1>波利工具箱</h1>
        <p>把临时的小工具集中在这里。左键波利仍然打开投放图上传，拖图到波利也不会改变。</p>
      </section>
      <section className="tool-card-grid">
        <button className="tool-card available" onClick={onOpenCompression} type="button">
          <span className="tool-card-icon">
            <FileImage size={22} />
          </span>
          <strong>图片压缩</strong>
          <small>多图批量压缩，支持单图参数微调和输出目录</small>
          <em>可用</em>
        </button>
        <div className="tool-card disabled">
          <span className="tool-card-icon">
            <Film size={22} />
          </span>
          <strong>视频取帧</strong>
          <small>已在投放图流程里可用，后续可独立成工具</small>
          <em>后续整理</em>
        </div>
        <div className="tool-card disabled">
          <span className="tool-card-icon">
            <ListChecks size={22} />
          </span>
          <strong>批量命名</strong>
          <small>预留入口，之后接发行设计的更多工作流</small>
          <em>计划中</em>
        </div>
      </section>
    </main>
  )
}

function CompressionWorkbench({
  config,
  items,
  selectedItem,
  busy,
  onSelect,
  onPickImages,
  onChooseOutputDir,
  onUpdateDefaults,
  onUpdateSelected,
  onPreview,
  onRun,
  onRemove,
  onClear
}: {
  config: AppConfig
  items: CompressionItem[]
  selectedItem?: CompressionItem
  busy: boolean
  onSelect: (id: string) => void
  onPickImages: () => void
  onChooseOutputDir: () => void
  onUpdateDefaults: (patch: Partial<CompressionOptions>) => void
  onUpdateSelected: (patch: Partial<CompressionOptions>) => void
  onPreview: () => void
  onRun: () => void
  onRemove: (id: string) => void
  onClear: () => void
}): JSX.Element {
  const [comparePosition, setComparePosition] = useState(50)
  const defaultOptions = config.compression.lastUsedOptions || defaultCompressionOptions
  const activeOptions = selectedItem?.options || defaultOptions
  const completed = items.filter((item) => item.status === 'completed')
  const originalTotal = items.reduce((sum, item) => sum + item.size, 0)
  const outputTotal = items.reduce((sum, item) => sum + (item.outputSize || item.preview?.size || 0), 0)
  const canRun = Boolean(items.length && !busy)

  return (
    <main className="compression-workbench">
      <aside className="compression-queue">
        <div className="section-title">
          <FileImage size={16} />
          <span>压缩队列</span>
          {items.length > 0 && (
            <button className="link-btn" onClick={onClear} type="button">
              清空
            </button>
          )}
        </div>
        <button className="compression-drop" onClick={onPickImages} type="button">
          <ImagePlus size={20} />
          <strong>拖入或选择图片</strong>
          <small>PNG / JPG / WebP</small>
        </button>
        {items.length === 0 ? (
          <div className="empty">右键波利进入这里后，把要压缩的图片拖进窗口。</div>
        ) : (
          items.map((item) => (
            <div
              className={`compression-row ${selectedItem?.id === item.id ? 'active' : ''}`}
              key={item.id}
              onClick={() => onSelect(item.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') onSelect(item.id)
              }}
            >
              <img src={item.dataUrl} alt="" />
              <span>
                <strong>{item.fileName}</strong>
                <small>
                  {formatBytes(item.size)} · {compressionStatusText(item)}
                </small>
              </span>
              {item.touched && <b>微调</b>}
              <button
                className="queue-remove-btn"
                onClick={(event) => {
                  event.stopPropagation()
                  onRemove(item.id)
                }}
                type="button"
                title="移除"
              >
                <X size={13} />
              </button>
            </div>
          ))
        )}
      </aside>

      <section className="compression-preview">
        {selectedItem ? (
          <>
            <div className="squoosh-stage-head">
              <div>
                <strong>{selectedItem.fileName}</strong>
                <small>
                  {selectedItem.width}×{selectedItem.height} · {selectedItem.format.toUpperCase()} ·{' '}
                  {formatBytes(selectedItem.size)}
                </small>
              </div>
              <span className={`auto-preview-chip ${selectedItem.status === 'previewing' ? 'running' : ''}`}>
                {selectedItem.status === 'previewing' ? <Loader2 className="spin" size={14} /> : <SlidersHorizontal size={14} />}
                自动预览
              </span>
            </div>
            <div className="squoosh-compare">
              <img className="compare-original" src={selectedItem.dataUrl} alt="" />
              {selectedItem.preview ? (
                <div className="compare-compressed" style={{ clipPath: `inset(0 ${100 - comparePosition}% 0 0)` }}>
                  <img src={selectedItem.preview.dataUrl} alt="" />
                </div>
              ) : (
                <div className="compare-loading">
                  <Loader2 className="spin" size={22} />
                  正在生成压缩预览
                </div>
              )}
              <div className="compare-divider" style={{ left: `${comparePosition}%` }}>
                <span>◀ ▶</span>
              </div>
              <input
                className="compare-slider"
                type="range"
                min="0"
                max="100"
                value={comparePosition}
                onChange={(event) => setComparePosition(Number(event.target.value))}
                aria-label="对比位置"
              />
              <div className="squoosh-stat original">
                <strong>Original</strong>
                <span>{formatBytes(selectedItem.size)}</span>
              </div>
              <div className="squoosh-stat compressed">
                <strong>{selectedItem.preview?.format?.toUpperCase() || activeOptions.format.toUpperCase()}</strong>
                <span>
                  {selectedItem.preview
                    ? `${formatBytes(selectedItem.preview.size)} · ${compressionSavings(selectedItem.size, selectedItem.preview.size)}`
                    : '计算中'}
                </span>
              </div>
            </div>
            {(selectedItem.warning || selectedItem.error) && (
              <p className={`compression-message ${selectedItem.error ? 'bad' : ''}`}>
                {selectedItem.error || selectedItem.warning}
              </p>
            )}
          </>
        ) : (
          <div className="compression-empty-stage">
            <FileImage size={28} />
            <strong>把图片加入队列后开始压缩</strong>
            <span>这里会显示原图和压缩预览。</span>
          </div>
        )}
      </section>

      <aside className="compression-settings">
        <div className="compression-settings-head">
          <span>Edit</span>
          <small>{selectedItem?.touched ? '单图已微调' : '默认参数'}</small>
        </div>
        <div className="compress-panel-title">Compress</div>
        <CompressionOptionsForm
          options={activeOptions}
          hasAlpha={Boolean(selectedItem?.hasAlpha)}
          onChange={selectedItem ? onUpdateSelected : onUpdateDefaults}
        />
        <div className="compression-output">
          <label>
            输出目录
            <div className="settings-path-row">
              <input readOnly value={config.compression.outputDir || '未设置，压缩前请选择'} />
              <button className="icon-btn" onClick={onChooseOutputDir} type="button">
                <FolderOpen size={15} />
              </button>
            </div>
          </label>
        </div>
      </aside>

      <footer className="compression-footer">
        <div className="footer-status">
          <span className={`footer-status-icon ${canRun ? 'ready' : 'pending'}`}>
            {canRun ? <CheckCircle2 size={18} /> : <ListChecks size={18} />}
          </span>
          <div>
            <strong>
              {items.length ? `${items.length} 张图片待压缩` : '等待添加图片'}
              {completed.length ? `，${completed.length} 张已输出` : ''}
            </strong>
            <small>
              {items.length
                ? `原图 ${formatBytes(originalTotal)}，预估/输出 ${formatBytes(outputTotal)}`
                : '拖入图片或点击左侧按钮添加到队列'}
            </small>
          </div>
        </div>
        <button className="primary-btn" disabled={!canRun} onClick={onRun} type="button">
          {busy ? <Loader2 className="spin" size={16} /> : <ArrowDownToLine size={16} />}
          开始压缩
        </button>
      </footer>
    </main>
  )
}

function CompressionOptionsForm({
  options,
  hasAlpha,
  onChange
}: {
  options: CompressionOptions
  hasAlpha: boolean
  onChange: (patch: Partial<CompressionOptions>) => void
}): JSX.Element {
  return (
    <div className="compression-options">
      <label>
        输出格式
        <select value={options.format} onChange={(event) => onChange({ format: event.target.value as CompressionFormat })}>
          <option value="original">保持原格式</option>
          <option value="jpeg">JPG</option>
          <option value="png">PNG</option>
          <option value="webp">WebP</option>
          <option value="avif">AVIF</option>
        </select>
      </label>
      {hasAlpha && options.format === 'jpeg' && <p className="compression-hint">这张图有透明通道，转 JPG 会合成背景色。</p>}
      <label>
        质量 {options.quality}
        <input
          type="range"
          min="1"
          max="100"
          value={options.quality}
          onChange={(event) => onChange({ quality: Number(event.target.value) })}
        />
      </label>
      <label>
        尺寸
        <select
          value={options.resizeMode}
          onChange={(event) => onChange({ resizeMode: event.target.value as CompressionResizeMode })}
        >
          <option value="none">保持原尺寸</option>
          <option value="longEdge">限制最长边</option>
          <option value="exact">指定宽高内适配</option>
        </select>
      </label>
      {options.resizeMode === 'longEdge' && (
        <label>
          最长边
          <input type="number" min="16" value={options.longEdge} onChange={(event) => onChange({ longEdge: Number(event.target.value) })} />
        </label>
      )}
      {options.resizeMode === 'exact' && (
        <div className="compression-size-pair">
          <label>
            宽
            <input type="number" min="16" value={options.width} onChange={(event) => onChange({ width: Number(event.target.value) })} />
          </label>
          <label>
            高
            <input type="number" min="16" value={options.height} onChange={(event) => onChange({ height: Number(event.target.value) })} />
          </label>
        </div>
      )}
      <label>
        透明转 JPG 背景
        <input type="color" value={options.background} onChange={(event) => onChange({ background: event.target.value })} />
      </label>
      <label className="settings-check">
        <input
          type="checkbox"
          checked={options.removeMetadata}
          onChange={(event) => onChange({ removeMetadata: event.target.checked })}
        />
        <span>移除图片元数据</span>
      </label>
    </div>
  )
}

function SettingsPanel({
  config,
  schema,
  syncing,
  onChange,
  onSave,
  onClose,
  onSync,
  onChooseDir,
  onChooseOutputDir,
  onChooseProjectOutputDir,
  onChooseProjectVideoOutputDir,
  onChooseGroupOutputDir,
  updateStatus,
  onCheckUpdates
}: {
  config: AppConfig
  schema: SchemaSnapshot
  syncing: boolean
  onChange: (patch: Partial<AppConfig>) => void
  onSave: () => void
  onClose: () => void
  onSync: () => void
  onChooseDir: (kind: OverlayKind) => void
  onChooseOutputDir: () => void
  onChooseProjectOutputDir: () => void
  onChooseProjectVideoOutputDir: () => void
  onChooseGroupOutputDir: (group: 'roc' | 'rorEu' | 'ror') => void
  updateStatus: string
  onCheckUpdates: () => void
}): JSX.Element {
  const fieldNames = schema.fields.map((field) => field.fieldName)
  const tables = projectTables(schema.tables)
  const outputRows: Array<{ group: 'roc' | 'rorEu' | 'ror'; label: string; hint: string }> = [
    { group: 'roc', label: 'ROC平面输出目录', hint: '未设置，使用上方通用输出目录' },
    { group: 'rorEu', label: 'ROR欧美平面输出目录', hint: '未设置，使用上方通用输出目录' },
    { group: 'ror', label: 'ROR平面输出目录', hint: '未设置，使用上方通用输出目录' }
  ]
  const fieldLabels: Record<string, string> = {
    language: '语言',
    size: '尺寸',
    assetContent: '素材形式',
    detailContent: '素材方向',
    designer: '设计师',
    creative: '创意',
    completionDate: '完成日期',
    fullName: '素材完整命名',
    finalAsset: '成品',
    progress: '进展'
  }

  return (
    <main className="settings-panel">
      <div className="settings-scroll">
        <div className="settings-content">
          <section className="settings-card">
            <div className="settings-card-heading">
              <span className="settings-card-icon">
                <Database size={17} />
              </span>
              <div>
                <h2>飞书连接</h2>
                <p>配置多维表格应用凭证和目标数据表</p>
              </div>
              <button className="secondary-btn" onClick={onSync}>
                <RefreshCw size={14} className={syncing ? 'spin' : ''} />
                同步字段
              </button>
            </div>
            <div className="settings-form">
              <label>
                App ID
                <MaskedSettingInput
                  value={config.feishu.appId}
                  onChange={(value) => onChange({ feishu: { ...config.feishu, appId: value } })}
                />
              </label>
              <label>
                App Secret
                <input
                  type="password"
                  value={config.feishu.appSecret}
                  onChange={(e) => onChange({ feishu: { ...config.feishu, appSecret: e.target.value } })}
                />
              </label>
              <label>
                App Token
                <MaskedSettingInput
                  value={config.feishu.appToken}
                  onChange={(value) => onChange({ feishu: { ...config.feishu, appToken: value } })}
                />
              </label>
              <label>
                数据表
                <select
                  value={config.feishu.tableId}
                  onChange={(e) => onChange({ feishu: { ...config.feishu, tableId: e.target.value } })}
                >
                  <option value="">选择数据表</option>
                  {tables.map((table) => (
                    <option key={table.tableId} value={table.tableId}>
                      {table.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          <section className="settings-card">
            <div className="settings-card-heading">
              <span className="settings-card-icon">
                <Settings size={17} />
              </span>
              <div>
                <h2>工作流偏好</h2>
                <p>设置软件常驻方式、开机启动和本地输出归档</p>
              </div>
            </div>
            <div className="settings-form">
              <label>
                输出目录
                <div className="settings-path-row">
                  <input readOnly value={config.workflow.outputDir || '未设置，默认输出到源图目录'} />
                  <button className="icon-btn" onClick={onChooseOutputDir} type="button">
                    <FolderOpen size={15} />
                  </button>
                </div>
              </label>
              <div className="settings-path-group">
                {outputRows.map((row) => (
                  <label key={row.group}>
                    {row.label}
                    <div className="settings-path-row">
                      <input readOnly value={config.workflow.groupOutputDirs?.[row.group] || row.hint} />
                      <button className="icon-btn" onClick={() => onChooseGroupOutputDir(row.group)} type="button">
                        <FolderOpen size={15} />
                      </button>
                    </div>
                  </label>
                ))}
              </div>
              <label className="settings-check">
                <input
                  type="checkbox"
                  checked={config.workflow.organizeByMonth}
                  onChange={(event) =>
                    onChange({ workflow: { ...config.workflow, organizeByMonth: event.target.checked } } as Partial<AppConfig>)
                  }
                />
                <span>按年份/月自动分类输出</span>
              </label>
              <label className="settings-check">
                <input
                  type="checkbox"
                  checked={config.workflow.launchAtLogin}
                  onChange={(event) =>
                    onChange({ workflow: { ...config.workflow, launchAtLogin: event.target.checked } } as Partial<AppConfig>)
                  }
                />
                <span>开机自动启动</span>
              </label>
              <label className="settings-check">
                <input
                  type="checkbox"
                  checked={config.workflow.keepInBackground}
                  onChange={(event) =>
                    onChange({ workflow: { ...config.workflow, keepInBackground: event.target.checked } } as Partial<AppConfig>)
                  }
                />
                <span>关闭窗口时常驻后台</span>
              </label>
            </div>
          </section>

          <section className="settings-card">
            <div className="settings-card-heading">
              <span className="settings-card-icon">
                <RefreshCw size={17} />
              </span>
              <div>
                <h2>外观与更新</h2>
                <p>调整点缀色，并配置团队内部更新源</p>
              </div>
              <button className="secondary-btn" onClick={onCheckUpdates} type="button">
                检查更新
              </button>
            </div>
            <div className="settings-form">
              <label>
                点缀色
                <div className="color-setting-row">
                  <input
                    className="color-input"
                    type="color"
                    value={config.workflow.accentColor || DEFAULT_ACCENT}
                    onChange={(event) =>
                      onChange({ workflow: { ...config.workflow, accentColor: event.target.value } } as Partial<AppConfig>)
                    }
                  />
                  <input
                    value={config.workflow.accentColor || DEFAULT_ACCENT}
                    onChange={(event) =>
                      onChange({ workflow: { ...config.workflow, accentColor: event.target.value } } as Partial<AppConfig>)
                    }
                  />
                </div>
              </label>
              <label>
                更新源地址
                <MaskedSettingInput
                  placeholder="例如 https://updates.example.com/poring-gameale/"
                  value={config.workflow.updateUrl}
                  onChange={(value) =>
                    onChange({ workflow: { ...config.workflow, updateUrl: value } } as Partial<AppConfig>)
                  }
                />
              </label>
              <label className="settings-check">
                <input
                  type="checkbox"
                  checked={config.workflow.autoCheckUpdates}
                  onChange={(event) =>
                    onChange({ workflow: { ...config.workflow, autoCheckUpdates: event.target.checked } } as Partial<AppConfig>)
                  }
                />
                <span>启动时自动检查更新</span>
              </label>
              <p className="settings-note">{updateStatus || '内部更新源配置后，打包版本会自动检查最新安装包。'}</p>
            </div>
          </section>

          <section className="settings-card">
            <div className="settings-card-heading">
              <span className="settings-card-icon">
                <FolderCog size={17} />
              </span>
              <div>
                <h2>本地素材库</h2>
                <p>选择 Logo、Slogan、Icon 的图片素材目录</p>
              </div>
            </div>
            <div className="settings-form">
              {overlayKinds.map((kind) => (
                <label key={kind}>
                  {overlayLabels[kind]} Directory
                  <div className="settings-path-row">
                    <input readOnly value={config.assetLibrary[`${kind}Dir` as keyof typeof config.assetLibrary] || '未设置'} />
                    <button className="icon-btn" onClick={() => onChooseDir(kind)} type="button">
                      <FolderOpen size={15} />
                    </button>
                  </div>
                </label>
              ))}
            </div>
          </section>

          <section className="settings-card">
            <div className="settings-card-heading">
              <span className="settings-card-icon">
                <ListChecks size={17} />
              </span>
              <div>
                <h2>字段映射</h2>
                <p>字段改名后，可以在这里重新指定软件要写入的位置</p>
              </div>
            </div>
            <div className="settings-form settings-grid">
              {Object.entries(config.fieldMapping).map(([key, value]) => (
                <label key={key}>
                  {fieldLabels[key] || key}
                  <input
                    list="field-names"
                    value={value}
                    onChange={(e) =>
                      onChange({
                        fieldMapping: {
                          ...config.fieldMapping,
                          [key]: e.target.value
                        }
                      })
                    }
                  />
                </label>
              ))}
              <datalist id="field-names">
                {fieldNames.map((name) => (
                  <option value={name} key={name} />
                ))}
              </datalist>
            </div>
          </section>
        </div>
      </div>

      <div className="settings-actions">
        <button className="ghost-btn" onClick={onClose}>
          取消
        </button>
        <button className="primary-btn" onClick={onSave}>
          <Save size={15} />
          保存设置
        </button>
      </div>
    </main>
  )
}

function FieldForm({
  config,
  fields,
  selections,
  onChange
}: {
  config: AppConfig
  fields: BitableField[]
  selections: UploadSelections
  onChange: (patch: Partial<UploadSelections>) => void
}): JSX.Element {
  function optionsFor(fieldName: string): string[] {
    return optionsForField(fields, fieldName)
  }
  const mapping = config.fieldMapping
  return (
    <section className="field-grid">
      <ChipSelect
        label="语言"
        value={selections.language}
        options={optionsFor(mapping.language)}
        onChange={(language) => onChange({ language })}
      />
      <ChipSelect
        label="尺寸"
        value={selections.size}
        options={optionsFor(mapping.size)}
        onChange={(size) => onChange({ size })}
      />
      <label className="date-field">
        <span>完成日期</span>
        <input
          type="date"
          value={selections.completionDate}
          onChange={(event) => onChange({ completionDate: event.target.value })}
        />
      </label>
      <ChipSelect
        label="创意"
        value={selections.creative}
        options={optionsFor(mapping.creative)}
        onChange={(creative) => onChange({ creative })}
      />
      <ChipSelect
        label="素材形式"
        value={selections.assetContent}
        options={optionsFor(mapping.assetContent)}
        onChange={(assetContent) => onChange({ assetContent })}
      />
      <ChipSelect
        label="素材方向"
        value={selections.detailContent}
        options={optionsFor(mapping.detailContent)}
        onChange={(detailContent) => onChange({ detailContent })}
      />
    </section>
  )
}

function ChipSelect({
  label,
  value,
  options,
  onChange
}: {
  label: string
  value: string
  options: string[]
  onChange: (value: string) => void
}): JSX.Element {
  if (options.length > 0) {
    return (
      <label className="chip-select field-card">
        <span>{label}</span>
        <div>
          <select value={value} onChange={(event) => onChange(event.target.value)}>
            <option value="">选择</option>
            {options.map((option) => (
              <option value={option} key={option}>
                {option}
              </option>
            ))}
          </select>
          <ChevronDown size={13} />
        </div>
      </label>
    )
  }

  return (
    <label className="chip-select field-card missing">
      <span>{label}</span>
      <div>
        <input value={value} onChange={(event) => onChange(event.target.value)} placeholder="未同步选项" />
        <CircleAlert size={13} />
      </div>
    </label>
  )
}

function ImageQueue({
  items,
  config,
  fields,
  selectedId,
  uploading,
  onSelect,
  onShowDetails,
  onRemove
}: {
  items: QueueItem[]
  config: AppConfig
  fields: BitableField[]
  selectedId: string
  uploading: boolean
  onSelect: (id: string) => void
  onShowDetails: (id: string) => void
  onRemove: (id: string) => void
}): JSX.Element {
  return (
    <section className="queue">
      <div className="section-title">
        <Cloud size={16} />
        <span>上传队列</span>
      </div>
      {items.length === 0 ? (
        <div className="empty">暂无图片</div>
      ) : (
        items.map((item) => {
          const ready = isItemReady(item, config, fields)
          return (
            <div
              className={`queue-row ${selectedId === item.id ? 'active' : ''} ${ready ? 'ready' : ''}`}
              key={item.id}
              onClick={() => onSelect(item.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') onSelect(item.id)
              }}
              role="button"
              tabIndex={0}
            >
              <img src={item.dataUrl} alt="" />
              <span>
                <strong>{item.generatedName || item.fileName}</strong>
                <small>{queueSummary(item, ready)}</small>
              </span>
              <button
                className={`queue-status-btn ${item.error ? 'has-detail' : ''}`}
                onClick={(event) => {
                  event.stopPropagation()
                  if (item.status === 'completed' || item.status === 'failed' || item.error || item.outputPath) {
                    onShowDetails(item.id)
                  }
                }}
                title={item.status === 'completed' || item.status === 'failed' || item.error ? '查看详情' : statusText(item.status)}
                type="button"
              >
                {statusIcon(item.status, ready, Boolean(item.error))}
              </button>
              {!uploading && (
                <i
                  onClick={(event) => {
                    event.stopPropagation()
                    onRemove(item.id)
                  }}
                >
                  <X size={13} />
                </i>
              )}
            </div>
          )
        })
      )}
    </section>
  )
}

function queueSummary(item: QueueItem, ready: boolean): string {
  if (item.status === 'failed') return '处理失败，点击查看'
  if (item.status === 'completed') return item.error ? '已完成，有提醒' : '已完成'
  if (item.outputPath) return '本地已生成'
  return ready ? '已准备' : statusText(item.status)
}

function QueueDetailDialog({ item, onClose }: { item: QueueItem; onClose: () => void }): JSX.Element {
  const isSuccess = item.status === 'completed'
  return (
    <div className="detail-backdrop" onClick={onClose}>
      <section className="queue-detail" onClick={(event) => event.stopPropagation()}>
        <header>
          <span className={isSuccess ? 'ok' : item.status === 'failed' ? 'bad' : 'muted'}>
            {statusIcon(item.status, item.status === 'waiting', Boolean(item.error))}
          </span>
          <div>
            <strong>{isSuccess ? '处理完成' : item.status === 'failed' ? '处理失败' : '队列详情'}</strong>
            <small>{item.generatedName || item.fileName}</small>
          </div>
          <button className="icon-btn" onClick={onClose} type="button" title="关闭">
            <X size={15} />
          </button>
        </header>
        <dl>
          <div>
            <dt>当前状态</dt>
            <dd>{queueSummary(item, isSuccess)}</dd>
          </div>
          {item.outputPath && (
            <div>
              <dt>本地成品</dt>
              <dd>{item.outputPath}</dd>
            </div>
          )}
          {item.recordId && (
            <div>
              <dt>飞书记录</dt>
              <dd>{item.recordId}</dd>
            </div>
          )}
          {item.error && (
            <div>
              <dt>{isSuccess ? '回写提醒' : '错误信息'}</dt>
              <dd>{item.error}</dd>
            </div>
          )}
        </dl>
      </section>
    </div>
  )
}

function isItemReady(item: QueueItem, config: AppConfig, fields: BitableField[]): boolean {
  if (item.status === 'completed') return true
  if (item.status === 'failed') return false
  const schemaReady = fields.length > 0
  const requiredSelections: Array<keyof UploadSelections> = [
    'language',
    'size',
    'assetContent',
    'detailContent',
    'designer',
    'creative',
    'completionDate'
  ]
  const selectedTableReady = Boolean(config.feishu.tableId)
  const fieldsReady = requiredSelections.every((key) => isSelectionValueReady(config, fields, item.selections, key))
  const overlaysReady = overlayKinds.every((kind) => !item.overlays[kind].enabled || Boolean(item.overlays[kind].assetPath))
  return selectedTableReady && schemaReady && fieldsReady && overlaysReady
}

function isSelectionValueReady(
  config: AppConfig,
  fields: BitableField[],
  selections: UploadSelections,
  key: keyof UploadSelections
): boolean {
  const value = selections[key]?.trim()
  if (!value) return false
  const fieldName = config.fieldMapping[key]
  const options = fieldName ? optionsForField(fields, fieldName) : []
  if (!options.length) return true
  return options.includes(value)
}

function statusText(status: ImageItem['status']): string {
  return {
    waiting: '内容待填写',
    'creating-record': '创建记录中',
    processing: '处理中',
    uploading: '上传中',
    completed: '已完成',
    failed: '失败'
  }[status]
}

function statusIcon(status: ImageItem['status'], ready = false, hasWarning = false): JSX.Element {
  if (status === 'completed') return <CheckCircle2 className={hasWarning ? 'warn' : 'ok'} size={16} />
  if (status === 'failed') return <CircleAlert className="bad" size={16} />
  if (status !== 'waiting') return <Loader2 className="spin" size={16} />
  if (ready) return <CheckCircle2 className="ready-icon" size={16} />
  return <GripVertical className="muted" size={16} />
}

function CanvasPreview({
  item,
  assetFiles,
  onUpdateOverlay
}: {
  item?: QueueItem
  assetFiles: Record<OverlayKind, AssetFile[]>
  onUpdateOverlay: (kind: OverlayKind, patch: Partial<OverlaySettings>) => void
}): JSX.Element {
  if (!item) {
    return (
      <div className="preview empty-editor">
        <div className="empty">拖入图片后显示预览</div>
      </div>
    )
  }

  return (
    <div className="preview">
      <img src={item.dataUrl} alt="" />
      {overlayKinds.map((kind) => {
        const overlay = item.overlays[kind]
        if (!overlay.enabled || !overlay.assetPath) return null
        const asset = assetFiles[kind].find((file) => file.path === overlay.assetPath)
        return (
          <OverlayHandle
            key={kind}
            kind={kind}
            overlay={overlay}
            asset={asset}
            onMove={(x, y) => onUpdateOverlay(kind, { x, y })}
            onResize={(scale) => onUpdateOverlay(kind, { scale })}
          />
        )
      })}
    </div>
  )
}

function OverlayControls({
  item,
  assetFiles,
  onUpdateOverlay
}: {
  item?: QueueItem
  assetFiles: Record<OverlayKind, AssetFile[]>
  onUpdateOverlay: (kind: OverlayKind, patch: Partial<OverlaySettings>) => void
}): JSX.Element {
  if (!item) {
    return (
      <div className="overlay-controls empty-editor">
        <div className="empty">选择图片后可设置 Logo / Slogan / Icon</div>
      </div>
    )
  }

  return (
    <div className="overlay-controls">
      {overlayKinds.map((kind) => {
        return (
          <div className="overlay-row" key={kind}>
            <label className="toggle">
              <input
                type="checkbox"
                checked={item.overlays[kind].enabled}
                onChange={(event) => onUpdateOverlay(kind, { enabled: event.target.checked })}
              />
              <span>{overlayLabels[kind]}</span>
            </label>
            <div className="overlay-asset-line">
              <select
                value={item.overlays[kind].assetPath}
                onChange={(event) =>
                  onUpdateOverlay(kind, {
                    assetPath: event.target.value,
                    enabled: Boolean(event.target.value),
                    scale: overlayDefaultScale[kind]
                  })
                }
              >
                <option value="">{overlayPlaceholders[kind]}</option>
                {assetFiles[kind].map((asset) => (
                  <option value={asset.path} key={asset.path}>
                    {asset.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function OverlayEditor({
  item,
  assetFiles,
  onUpdateOverlay,
  onReset
}: {
  item?: QueueItem
  assetFiles: Record<OverlayKind, AssetFile[]>
  onUpdateOverlay: (kind: OverlayKind, patch: Partial<OverlaySettings>) => void
  onReset: () => void
}): JSX.Element {
  if (!item) {
    return (
      <section className="editor empty-editor">
        <div className="empty">选择图片后可设置 logo / slogan / icon</div>
      </section>
    )
  }

  return (
    <section className="editor">
      <div className="section-title">
        <span>可选叠加</span>
        <button className="icon-btn" onClick={onReset} title="重置位置">
          <RotateCcw size={14} />
        </button>
      </div>
      <div className="preview">
        <img src={item.dataUrl} alt="" />
        {overlayKinds.map((kind) => {
          const overlay = item.overlays[kind]
          if (!overlay.enabled || !overlay.assetPath) return null
          const asset = assetFiles[kind].find((file) => file.path === overlay.assetPath)
          return (
            <OverlayHandle
              key={kind}
              kind={kind}
              overlay={overlay}
              asset={asset}
              onMove={(x, y) => onUpdateOverlay(kind, { x, y })}
              onResize={(scale) => onUpdateOverlay(kind, { scale })}
            />
          )
        })}
      </div>
      {overlayKinds.map((kind) => (
        <div className="overlay-row" key={kind}>
          <label className="toggle">
            <input
              type="checkbox"
              checked={item.overlays[kind].enabled}
              onChange={(event) => onUpdateOverlay(kind, { enabled: event.target.checked })}
            />
            <span>{overlayLabels[kind]}</span>
          </label>
          <select
            value={item.overlays[kind].assetPath}
            onChange={(event) =>
              onUpdateOverlay(kind, {
                assetPath: event.target.value,
                enabled: Boolean(event.target.value),
                scale: overlayDefaultScale[kind]
              })
            }
          >
            <option value="">选择素材</option>
            {assetFiles[kind].map((asset) => (
              <option value={asset.path} key={asset.path}>
                {asset.name}
              </option>
            ))}
          </select>
          <input
            type="range"
            min="0.05"
            max="1"
            step="0.01"
            value={item.overlays[kind].scale}
            onChange={(event) => onUpdateOverlay(kind, { scale: Number(event.target.value) })}
          />
        </div>
      ))}
    </section>
  )
}

function OverlayHandle({
  kind,
  overlay,
  asset,
  onMove,
  onResize
}: {
  kind: OverlayKind
  overlay: OverlaySettings
  asset?: AssetFile
  onMove: (x: number, y: number) => void
  onResize: (scale: number) => void
}): JSX.Element {
  function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value))
  }

  function startResize(event: React.PointerEvent<HTMLSpanElement>): void {
    event.preventDefault()
    event.stopPropagation()
    const preview = event.currentTarget.closest('.preview')
    if (!(preview instanceof HTMLElement)) return
    const rect = preview.getBoundingClientRect()
    const move = (moveEvent: PointerEvent): void => {
      const pointerX = (moveEvent.clientX - rect.left) / rect.width
      const nextScale = clamp(Math.abs(pointerX - overlay.x) * 2, 0.05, 1)
      onResize(nextScale)
    }
    const up = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <button
      className={`overlay-handle ${kind}`}
      style={{
        left: `${overlay.x * 100}%`,
        top: `${overlay.y * 100}%`,
        width: `${Math.max(8, Math.min(100, overlay.scale * 100))}%`
      }}
      onPointerDown={(event) => {
        const target = event.currentTarget.parentElement
        if (!target) return
        const rect = target.getBoundingClientRect()
        const move = (moveEvent: PointerEvent): void => {
          onMove(
            Math.max(0.02, Math.min(0.98, (moveEvent.clientX - rect.left) / rect.width)),
            Math.max(0.02, Math.min(0.98, (moveEvent.clientY - rect.top) / rect.height))
          )
        }
        const up = (): void => {
          window.removeEventListener('pointermove', move)
          window.removeEventListener('pointerup', up)
        }
        window.addEventListener('pointermove', move)
        window.addEventListener('pointerup', up)
      }}
    >
      {asset?.dataUrl ? <img src={asset.dataUrl} alt={overlayLabels[kind]} /> : overlayLabels[kind]}
      {(['nw', 'ne', 'sw', 'se'] as const).map((corner) => (
        <span
          className={`resize-corner ${corner}`}
          key={corner}
          onPointerDown={startResize}
          aria-hidden="true"
        />
      ))}
    </button>
  )
}

export default App
