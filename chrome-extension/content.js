let draggedImagePayload = null
let dropTarget = null
let hideTimer = 0

document.addEventListener('dragstart', (event) => {
  const image = findImage(event.target)
  if (!image) return
  draggedImagePayload = payloadFromImage(image)
  showDropTarget()
})

document.addEventListener('dragend', () => {
  scheduleHide()
})

function findImage(target) {
  if (!target || !(target instanceof Element)) return null
  if (target instanceof HTMLImageElement && imageSource(target)) return target
  return target.closest?.('img')
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

function showDropTarget() {
  if (!dropTarget) {
    dropTarget = document.createElement('div')
    dropTarget.id = 'boli-import-drop-target'
    dropTarget.innerHTML = '<span>波利</span><strong>拖到这里</strong>'
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
