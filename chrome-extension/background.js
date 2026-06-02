const BOLI_IMPORT_ENDPOINT = 'http://127.0.0.1:17367/import-image'
const BOLI_HEALTH_ENDPOINT = 'http://127.0.0.1:17367/health'
const MENU_SAVE_IMAGE = 'boli-save-image'

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_SAVE_IMAGE,
      title: '保存到波利AI图助手',
      contexts: ['image']
    })
  })
})

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId !== MENU_SAVE_IMAGE || !info.srcUrl) return
  void importImage({ url: info.srcUrl, fileName: filenameFromUrl(info.srcUrl) })
})

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== 'BOLI_IMPORT_IMAGE') return false
  importImage({
    url: message.url,
    dataUrl: message.dataUrl,
    fileName: message.fileName
  })
    .then(() => sendResponse({ ok: true }))
    .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }))
  return true
})

async function importImage(payload) {
  const normalized = await normalizePayload(payload)
  const response = await fetch(BOLI_IMPORT_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(normalized)
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok || !data.ok) {
    const online = await isBoliRunning()
    throw new Error(online ? data.error || '导入失败。' : '波利AI图助手未启动。')
  }
  notify('已加入波利AI图助手')
}

async function normalizePayload(payload) {
  if (payload.dataUrl) {
    return {
      dataUrl: payload.dataUrl,
      fileName: payload.fileName || 'browser-image.png'
    }
  }
  if (!payload.url) throw new Error('没有图片地址。')
  try {
    const response = await fetch(payload.url, { credentials: 'include' })
    if (!response.ok) throw new Error(String(response.status))
    const blob = await response.blob()
    if (!blob.type.startsWith('image/')) throw new Error('not image')
    return {
      dataUrl: await blobToDataUrl(blob),
      fileName: payload.fileName || filenameFromUrl(payload.url)
    }
  } catch {
    return {
      url: payload.url,
      fileName: payload.fileName || filenameFromUrl(payload.url)
    }
  }
}

async function isBoliRunning() {
  try {
    const response = await fetch(BOLI_HEALTH_ENDPOINT)
    const data = await response.json()
    return Boolean(response.ok && data.ok)
  } catch {
    return false
  }
}

function filenameFromUrl(url) {
  try {
    const name = decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).pop() || '')
    return name || `browser-image-${Date.now()}.png`
  } catch {
    return `browser-image-${Date.now()}.png`
  }
}

function blobToDataUrl(blob) {
  return blob.arrayBuffer().then((buffer) => {
    const bytes = new Uint8Array(buffer)
    let binary = ''
    const chunkSize = 0x8000
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
    }
    return `data:${blob.type || 'image/png'};base64,${btoa(binary)}`
  })
}

function notify(message) {
  chrome.notifications?.create({
    type: 'basic',
    iconUrl: 'icon.png',
    title: '波利AI图助手',
    message
  })
}
