import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowDownToLine,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Cloud,
  Database,
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
  Trash2,
  Upload,
  X
} from 'lucide-react'
import type {
  AppConfig,
  AssetFile,
  BitableField,
  ImageItem,
  OverlayKind,
  OverlaySettings,
  OverlayState,
  SchemaSnapshot,
  UploadSelections
} from '../../shared/types'
import { defaultOverlays } from '../../shared/types'
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
}

const overlayLabels: Record<OverlayKind, string> = {
  logo: '标志',
  slogan: '标语',
  icon: '图标'
}

const overlayKinds: OverlayKind[] = ['logo', 'slogan', 'icon']
const overlayPlaceholders: Record<OverlayKind, string> = {
  logo: '选择标志样式',
  slogan: '选择文字预设',
  icon: '选择图标库'
}
const overlayDefaultScale: Record<OverlayKind, number> = {
  logo: 0.32,
  slogan: 0.46,
  icon: 0.24
}
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp'])
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.m4v', '.webm'])

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

const DEFAULT_ACCENT = '#fd7e8a'

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
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [selectedId, setSelectedId] = useState<string>('')
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
    }, poringMood === 'idle' ? 120 : 1000 / 24)
    return () => window.clearInterval(timer)
  }, [activePoringFrames.length, collapsed, poringMood])

  useEffect(() => {
    if (poringMood !== 'press-intro') return
    const duration = Math.max(1, poringFrames.click.length) * (1000 / 24)
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
      if (!event.dataTransfer?.types.includes('Files')) return
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

  const allItemsReady = Boolean(
    config && queue.length && queue.every((item) => isItemReady(item, config, schema.fields))
  )
  const canUpload = Boolean(config && queue.length && allItemsReady && !uploading)

  async function loadAssetLists(nextConfig: AppConfig): Promise<void> {
    const [logo, slogan, icon] = await Promise.all([
      window.assetUploader.listAssets(nextConfig.assetLibrary.logoDir),
      window.assetUploader.listAssets(nextConfig.assetLibrary.sloganDir),
      window.assetUploader.listAssets(nextConfig.assetLibrary.iconDir)
    ])
    setAssetFiles({ logo, slogan, icon })
  }

  async function expandPanel(): Promise<void> {
    setCollapsed(false)
    await window.assetUploader.expand()
  }

  function appendImages(items: ImageItem[]): void {
    if (!config || !items.length) return
    const additions: QueueItem[] = items.map((item) => ({
      ...item,
      overlays: cloneOverlays(config.overlays)
    }))
    setQueue((current) => [...current, ...additions])
    setSelectedId((current) => current || additions[0].id)
  }

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

  function pathsFromDrop(files: FileList): string[] {
    return Array.from(files)
      .map((file) => window.assetUploader.getPathForFile(file))
      .filter(Boolean)
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
    event.preventDefault()
    const pointerId = event.pointerId
    const longPressTimer = window.setTimeout(() => {
      const state = moveRef.current
      if (!state || state.pointerId !== pointerId) return
      state.dragReady = true
      setPoringMood('press-intro')
    }, 240)
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

  async function syncSchema(): Promise<void> {
    setSyncing(true)
    try {
      const next = await window.assetUploader.syncSchema(config?.feishu.tableId)
      setSchema(next)
      if (config) {
        const resolved = withResolvedFieldMapping(config, next.fields)
        if (JSON.stringify(resolved.fieldMapping) !== JSON.stringify(config.fieldMapping)) {
          const saved = await window.assetUploader.saveConfig({ fieldMapping: resolved.fieldMapping })
          setConfig(applyProjectDefaults(saved, next.fields, next.tables.find((table) => table.tableId === saved.feishu.tableId)?.name || ''))
        }
      }
      const firstProjectTable = projectTables(next.tables)[0]
      if (config && firstProjectTable && !config.feishu.tableId) {
        const updated = await window.assetUploader.saveConfig({
          feishu: { ...config.feishu, tableId: firstProjectTable.tableId },
          workflow: {
            ...config.workflow,
            tableOutputGroups: {
              ...config.workflow.tableOutputGroups,
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
    setConfig(applyProjectDefaults(nextConfig, schema.fields, table?.name || ''))
    setSyncing(true)
    try {
      const nextSchema = await window.assetUploader.syncSchema(tableId)
      setSchema(nextSchema)
      const resolved = withResolvedFieldMapping(nextConfig, nextSchema.fields)
      const saved = await window.assetUploader.saveConfig({ fieldMapping: resolved.fieldMapping })
      setConfig(applyProjectDefaults(saved, nextSchema.fields, table?.name || ''))
    } catch (error) {
      alert(error instanceof Error ? error.message : String(error))
    } finally {
      setSyncing(false)
    }
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
    setQueue((current) => current.map((item) => (item.id === selectedItem.id ? { ...item, overlays: next } : item)))
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
        if (shouldUpdateDefault && item.status === 'waiting' && !item.overlays[kind].assetPath) {
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
      const message = error instanceof Error ? error.message : String(error)
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
    const effectiveConfig: AppConfig = {
      ...config,
      selections: {
        ...config.selections,
        completionDate: todayString()
      }
    }
    setConfig(effectiveConfig)
    setUploading(true)
    await window.assetUploader.saveConfig({
      ...effectiveConfig,
      selections: effectiveConfig.selections
    })
    for (const item of queue) {
      if (item.status === 'completed') continue
      setQueue((current) =>
        current.map((entry) => (entry.id === item.id ? { ...entry, status: 'creating-record', error: '' } : entry))
      )
      const result = await window.assetUploader.uploadOne({
        item,
        selections: effectiveConfig.selections,
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
          const paths = pathsFromDrop(event.dataTransfer.files)
          void importDroppedFiles(paths)
        }}
        onPointerDown={(event) => void handlePoringPointerDown(event)}
        onPointerMove={handlePoringPointerMove}
        onPointerUp={handlePoringPointerUp}
        onPointerCancel={handlePoringPointerCancel}
      >
        <div className="poring-shadow" />
        <img className="poring-image" src={activePoringFrame} alt="素材悬浮上传" />
      </div>
    )
  }

  return (
    <div
      className={`shell ${videoPanel ? 'video-shell' : ''}`}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault()
        const paths = pathsFromDrop(event.dataTransfer.files)
        void importDroppedFiles(paths)
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
              <span>素材悬浮上传</span>
            </div>
          </div>
        ) : (
          <div className="top-context">
            <ProjectDefaults
              config={config}
              schema={schema}
              syncing={syncing}
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
            onClick={() => {
              setCollapsed(true)
              void window.assetUploader.collapse()
            }}
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
              onRemove={(id) => {
                setQueue((current) => current.filter((item) => item.id !== id))
                if (selectedId === id) setSelectedId('')
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
                <FieldForm config={config} fields={schema.fields} onChange={updateSelections} />
              </section>
            </div>
          </section>

          <footer className="footer">
            <div className="footer-status">
              <span className={`footer-status-icon ${allItemsReady ? 'ready' : 'pending'}`}>
                {allItemsReady ? <CheckCircle2 size={18} /> : <ListChecks size={18} />}
              </span>
              <div>
                <strong>{queue.length ? `${queue.length} 张图片待处理` : '等待添加图片'}</strong>
                <small>{uploading ? '正在上传并重命名' : queue.length ? (allItemsReady ? '全部素材已准备，可以开始上传' : '补全字段和图层后开始上传') : '拖入图片或点击波利添加队列'}</small>
              </div>
            </div>
            <button className="primary-btn" disabled={!canUpload} onClick={uploadAll}>
              {uploading ? <Loader2 size={16} className="spin" /> : <ArrowDownToLine size={16} />}
              上传并重命名
            </button>
          </footer>
        </>
      )}
    </div>
  )
}

function UpdateToast({ state, onInstall }: { state: UpdateState; onInstall: () => void }): JSX.Element | null {
  if (!state.status || state.phase === 'idle' || state.phase === 'not-available') return null
  const isDownloaded = state.phase === 'downloaded'
  const isDownloading = state.phase === 'downloading'
  const isError = state.phase === 'error'
  return (
    <aside className={`update-toast ${isError ? 'error' : ''}`}>
      <div>
        <strong>{isDownloaded ? '新版本已准备好' : '在线更新'}</strong>
        <span>{state.status}</span>
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
  onProjectChange,
  onDesignerChange
}: {
  config: AppConfig
  schema: SchemaSnapshot
  syncing: boolean
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
          <select value={config.selections.designer} onChange={(event) => onDesignerChange(event.target.value)}>
            <option value="">选择设计师</option>
            {designerOptions.map((option) => (
              <option value={option} key={option}>
                {option}
              </option>
            ))}
          </select>
        ) : (
          <input
            value={config.selections.designer}
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
                <input value={config.feishu.appId} onChange={(e) => onChange({ feishu: { ...config.feishu, appId: e.target.value } })} />
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
                <input
                  value={config.feishu.appToken}
                  onChange={(e) => onChange({ feishu: { ...config.feishu, appToken: e.target.value } })}
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
                <input
                  placeholder="例如 https://updates.example.com/poring-gameale/"
                  value={config.workflow.updateUrl}
                  onChange={(event) =>
                    onChange({ workflow: { ...config.workflow, updateUrl: event.target.value } } as Partial<AppConfig>)
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
  onChange
}: {
  config: AppConfig
  fields: BitableField[]
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
        value={config.selections.language}
        options={optionsFor(mapping.language)}
        onChange={(language) => onChange({ language })}
      />
      <ChipSelect
        label="尺寸"
        value={config.selections.size}
        options={optionsFor(mapping.size)}
        onChange={(size) => onChange({ size })}
      />
      <label className="date-field">
        <span>完成日期</span>
        <input
          type="date"
          value={config.selections.completionDate}
          onChange={(event) => onChange({ completionDate: event.target.value })}
        />
      </label>
      <ChipSelect
        label="创意"
        value={config.selections.creative}
        options={optionsFor(mapping.creative)}
        onChange={(creative) => onChange({ creative })}
      />
      <ChipSelect
        label="素材形式"
        value={config.selections.assetContent}
        options={optionsFor(mapping.assetContent)}
        onChange={(assetContent) => onChange({ assetContent })}
      />
      <ChipSelect
        label="素材方向"
        value={config.selections.detailContent}
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
  onRemove
}: {
  items: QueueItem[]
  config: AppConfig
  fields: BitableField[]
  selectedId: string
  uploading: boolean
  onSelect: (id: string) => void
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
            <button
              className={`queue-row ${selectedId === item.id ? 'active' : ''} ${ready ? 'ready' : ''}`}
              key={item.id}
              onClick={() => onSelect(item.id)}
            >
              <img src={item.dataUrl} alt="" />
              <span>
                <strong>{item.generatedName || item.fileName}</strong>
                <small>{item.error || item.outputPath || (ready ? '已准备' : statusText(item.status))}</small>
              </span>
              {statusIcon(item.status, ready)}
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
            </button>
          )
        })
      )}
    </section>
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
  const fieldsReady = requiredSelections.every((key) => isSelectionValueReady(config, fields, key))
  const overlaysReady = overlayKinds.every((kind) => !item.overlays[kind].enabled || Boolean(item.overlays[kind].assetPath))
  return selectedTableReady && schemaReady && fieldsReady && overlaysReady
}

function isSelectionValueReady(config: AppConfig, fields: BitableField[], key: keyof UploadSelections): boolean {
  const value = config.selections[key]?.trim()
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

function statusIcon(status: ImageItem['status'], ready = false): JSX.Element {
  if (status === 'completed') return <CheckCircle2 className="ok" size={16} />
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
