let draggedImagePayload = null
let contextImagePayload = null
let dropTarget = null
let hideTimer = 0

document.addEventListener(
  'contextmenu',
  (event) => {
    contextImagePayload = payloadFromElement(event.target)
  },
  true
)

document.addEventListener('dragstart', (event) => {
  draggedImagePayload = payloadFromElement(event.target)
  if (!draggedImagePayload) return
  showDropTarget()
})

document.addEventListener('dragend', () => {
  scheduleHide()
})

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'BOLI_GET_CONTEXT_IMAGE') return false
  sendResponse({ payload: contextImagePayload })
  return false
})

function payloadFromElement(target) {
  const image = findImage(target)
  if (image) return payloadFromImage(image)
  const canvas = findCanvas(target)
  if (canvas) return payloadFromCanvas(canvas)
  const background = findBackgroundImage(target)
  if (background) return background
  return null
}

function findImage(target) {
  if (!target || !(target instanceof Element)) return null
  if (target instanceof HTMLImageElement && imageSource(target)) return target
  return target.closest?.('img')
}

function findCanvas(target) {
  if (!target || !(target instanceof Element)) return null
  if (target instanceof HTMLCanvasElement) return target
  return target.closest?.('canvas')
}

function imageSource(image) {
  return image.currentSrc || image.src || image.getAttribute('src') || ''
}

function payloadFromImage(image) {
  const url = imageSource(image)
  const alt = image.alt || ''
  const fileName = fileNameFromImage(url, alt)
  return { url, fileName }
}

function fileNameFromImage(url, alt) {
  try {
    const name = decodeURIComponent(new URL(url, location.href).pathname.split('/').filter(Boolean).pop() || '')
    if (name) return name
  } catch {
    // Keep fallback below.
  }
  return `${(alt || 'browser-image').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 60) || 'browser-image'}.png`
}

function payloadFromCanvas(canvas) {
  try {
    return {
      dataUrl: canvas.toDataURL('image/png'),
      fileName: `browser-canvas-${Date.now()}.png`
    }
  } catch {
    return null
  }
}

function findBackgroundImage(target) {
  if (!target || !(target instanceof Element)) return null
  const elements = [target, ...(target.parentElement ? [target.parentElement] : [])]
  for (const element of elements) {
    const value = window.getComputedStyle(element).backgroundImage
    const match = value.match(/url\((['"]?)(.*?)\1\)/)
    if (match?.[2]) {
      const url = new URL(match[2], location.href).href
      return { url, fileName: fileNameFromImage(url, element.getAttribute('aria-label') || '') }
    }
  }
  return null
}

function showDropTarget() {
  if (!dropTarget) {
    dropTarget = document.createElement('div')
    dropTarget.id = 'boli-import-drop-target'
    dropTarget.innerHTML = '<img src="" alt=""><strong>拖到这里</strong>'
    const icon = dropTarget.querySelector('img')
    icon.src = chrome.runtime.getURL('icons/icon-48.png')
    dropTarget.addEventListener('dragover', (event) => {
      event.preventDefault()
      event.dataTransfer.dropEffect = 'copy'
      showDropTarget()
    })
    dropTarget.addEventListener('drop', (event) => {
      event.preventDefault()
      const payload = draggedImagePayload
      draggedImagePayload = null
      hideDropTarget()
      if (payload) void sendImportPayload(payload)
    })
    document.documentElement.appendChild(dropTarget)
  }
  window.clearTimeout(hideTimer)
  dropTarget.classList.add('visible')
}

function scheduleHide() {
  window.clearTimeout(hideTimer)
  hideTimer = window.setTimeout(hideDropTarget, 600)
}

function hideDropTarget() {
  dropTarget?.classList.remove('visible')
}

async function sendImportPayload(payload) {
  if (/^blob:/i.test(payload.url)) {
    try {
      const response = await fetch(payload.url)
      const blob = await response.blob()
      payload = {
        dataUrl: await blobToDataUrl(blob),
        fileName: payload.fileName
      }
    } catch {
      // Fall back to URL payload.
    }
  }
  chrome.runtime.sendMessage({ type: 'BOLI_IMPORT_IMAGE', ...payload }, (response) => {
    if (response?.ok) showToast('已加入波利AI图助手')
    else showToast(response?.error || '导入失败，请确认波利AI图助手已启动')
  })
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

function showToast(text) {
  const toast = document.createElement('div')
  toast.className = 'boli-import-toast'
  toast.textContent = text
  document.documentElement.appendChild(toast)
  window.setTimeout(() => toast.classList.add('visible'), 0)
  window.setTimeout(() => {
    toast.classList.remove('visible')
    window.setTimeout(() => toast.remove(), 220)
  }, 1800)
}
