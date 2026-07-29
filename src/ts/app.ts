import { parse } from './Parser.js'
import { groupTables } from './PostProcessor.js'
import { compile } from './Compiler.js'
import { render } from './Renderer.js'
import {
  loadSettings,
  saveSettings,
  collectAllColumnKeys,
  copySettingsFrom,
} from './ColumnSettings.js'
import type { CompiledResult, ColumnSettings } from './types.js'

// ── State ──────────────────────────────────────────────────────────
let compiledResult: CompiledResult | null = null
let currentFileName = ''   // basename used for localStorage keys
let currentSettings: ColumnSettings = { hidden: [], renamed: {} }
/** Original column keys + labels captured before settings are applied. */
let allColumnKeys: string[] = []
let allColumnLabels: Record<string, string> = {}

// ── DOM references ─────────────────────────────────────────────────
const fileInput      = document.getElementById('file-input')      as HTMLInputElement
const searchInput    = document.getElementById('search-input')    as HTMLInputElement
const btnJson        = document.getElementById('btn-export-json') as HTMLButtonElement
const btnTheme       = document.getElementById('btn-theme')       as HTMLButtonElement
const btnColSettings = document.getElementById('btn-column-settings') as HTMLButtonElement
const statusBar      = document.getElementById('status-bar')      as HTMLDivElement
const tableContainer     = document.getElementById('table-container')     as HTMLDivElement
const unknownContainer = document.getElementById('unknown-container')     as HTMLDivElement
const errorContainer = document.getElementById('error-container')       as HTMLDivElement

// Dropdown elements
const dropdown       = document.getElementById('column-settings-dropdown') as HTMLDivElement | null
const colList        = document.getElementById('column-settings-list')     as HTMLDivElement | null
const hiddenBadge    = document.getElementById('col-hidden-badge')        as HTMLSpanElement | null
const renamedBadge   = document.getElementById('col-renamed-badge')       as HTMLSpanElement | null
const btnSave          = document.getElementById('btn-save-settings')      as HTMLButtonElement | null
const btnResetHidden   = document.getElementById('btn-reset-hidden')       as HTMLButtonElement | null
const btnResetRename   = document.getElementById('btn-reset-renamed')      as HTMLButtonElement | null
const selectSavedFiles = document.getElementById('select-saved-files')     as HTMLSelectElement | null
const btnLoadSettings  = document.getElementById('btn-load-settings')      as HTMLButtonElement | null

// ── Theme ────────────────────────────────────────────────────────────
const THEME_STORAGE_KEY = 'tbl-theme'

function getSavedTheme(): 'dark' | 'light' {
  return (localStorage.getItem(THEME_STORAGE_KEY) as 'dark' | 'light') || 'dark'
}

function applyTheme(theme: 'dark' | 'light'): void {
  document.body.setAttribute('data-theme', theme)
  btnTheme.innerHTML = theme === 'dark' ? '🌙 Тема' : '☀️ Тема'
  btnTheme.title = 'Переключить тему (сейчас: ' + (theme === 'dark' ? 'тёмная' : 'светлая') + ')'
  localStorage.setItem(THEME_STORAGE_KEY, theme)
}

function toggleTheme(): void {
  const current = getSavedTheme()
  applyTheme(current === 'dark' ? 'light' : 'dark')
}

applyTheme(getSavedTheme())
btnTheme.addEventListener('click', toggleTheme)

// ── Sticky scroll sync ─────────────────────────────────────────────
function syncScrollAreas(): void {
  const wrappers = document.querySelectorAll('.summary-table-wrapper')
  for (const wrapper of wrappers) {
    const scrollArea = wrapper.querySelector('.table-scroll-area') as HTMLElement
    const shim = wrapper.querySelector('.sticky-scroll-shim') as HTMLElement
    const shimInner = shim.querySelector('.inner') as HTMLElement
    if (!scrollArea || !shimInner) continue

    shimInner.style.width = scrollArea.scrollWidth + 'px'

    shim.addEventListener('scroll', () => {
      scrollArea.scrollLeft = shim.scrollLeft
    })

    scrollArea.addEventListener('scroll', () => {
      shim.scrollLeft = scrollArea.scrollLeft
    })
  }
}

/** Restore original column labels from captured values before applying settings. */
function restoreOriginalLabels(compiled: CompiledResult): void {
  for (const group of compiled.groups) {
    for (const col of group.columns) {
      const orig = allColumnLabels[col.key]
      if (orig) col.label = orig
    }
    if (group.type2Columns) {
      for (const col of group.type2Columns) {
        const orig = allColumnLabels[col.key]
        if (orig) col.label = orig
      }
    }
  }
}

// ── Column settings UI ──────────────────────────────────────────────

function updateBadges(): void {
  if (!hiddenBadge || !renamedBadge) return
  const hiddenCount = currentSettings.hidden.length
  const renamedCount = Object.keys(currentSettings.renamed).length

  if (hiddenCount > 0) {
    hiddenBadge.textContent = `С${hiddenCount}`
    hiddenBadge.classList.remove('hidden')
  } else {
    hiddenBadge.classList.add('hidden')
  }

  if (renamedCount > 0) {
    renamedBadge.textContent = `П${renamedCount}`
    renamedBadge.classList.remove('hidden')
  } else {
    renamedBadge.classList.add('hidden')
  }
}

function openColumnSettings(): void {
  if (!dropdown) return
  dropdown.classList.remove('hidden')
  renderColumnList()
  refreshSavedFilesSelect()
}

function closeColumnSettings(): void {
  if (!dropdown) return
  dropdown.classList.add('hidden')
}

function renderColumnList(): void {
  if (!colList) return

  colList.innerHTML = ''

  for (const key of allColumnKeys) {
    const originalLabel = allColumnLabels[key] ?? key

    const item = document.createElement('div')
    item.className = 'column-settings-item'

    const nameSpan = document.createElement('span')
    nameSpan.className = 'col-name'
    nameSpan.title = originalLabel
    nameSpan.textContent = originalLabel
    nameSpan.style.color = currentSettings.hidden.includes(key)
      ? 'var(--text-muted)'
      : 'var(--text-primary)'
    if (currentSettings.renamed[key]) {
      nameSpan.textContent = `${originalLabel} → ${currentSettings.renamed[key]}`
    }

    const checkbox = document.createElement('input')
    checkbox.type = 'checkbox'
    checkbox.title = 'Скрыть столбец во всех группах'
    checkbox.dataset.key = key
    checkbox.checked = currentSettings.hidden.includes(key)

    const renameInput = document.createElement('input')
    renameInput.type = 'text'
    renameInput.className = 'col-rename-input'
    renameInput.placeholder = 'Переименовать…'
    renameInput.title = 'Новое имя столбца при выводе и экспорте'
    renameInput.dataset.key = key
    renameInput.value = currentSettings.renamed[key] ?? ''

    item.appendChild(nameSpan)
    item.appendChild(checkbox)
    item.appendChild(renameInput)
    colList.appendChild(item)
  }
}

function applyFromList(): void {
  if (!colList || !compiledResult) return

  const items = colList.querySelectorAll('.column-settings-item')
  const hidden: string[] = []
  const renamed: Record<string, string> = {}

  for (const item of items) {
    const checkbox = item.querySelector('input[type="checkbox"]') as HTMLInputElement
    const renameInput = item.querySelector('input.col-rename-input') as HTMLInputElement
    const key = checkbox?.dataset.key

    if (!key) continue

    if (checkbox?.checked) {
      hidden.push(key)
    }

    const newLabel = renameInput?.value.trim()
    if (newLabel) {
      renamed[key] = newLabel
    }
  }

  currentSettings = { hidden, renamed }
  updateBadges()
}

// Save button
btnSave?.addEventListener('click', () => {
  if (!compiledResult || !currentFileName) return
  applyFromList()
  saveSettings(currentFileName, currentSettings)
  // Re-render with new settings
  restoreOriginalLabels(compiledResult)
  render(compiledResult, tableContainer, unknownContainer, errorContainer, currentSettings)
  syncScrollAreas()
  closeColumnSettings()
})

// Reset hidden button
btnResetHidden?.addEventListener('click', () => {
  currentSettings.hidden = []
  if (colList) {
    for (const item of colList.querySelectorAll('input[type="checkbox"]')) {
      (item as HTMLInputElement).checked = false
    }
  }
  updateBadges()
})

// Reset renamed button
btnResetRename?.addEventListener('click', () => {
  currentSettings.renamed = {}
  if (colList) {
    for (const item of colList.querySelectorAll('input.col-rename-input')) {
      (item as HTMLInputElement).value = ''
    }
  }
  updateBadges()
})

/** Collect unique saved file basenames from localStorage, optionally excluding one. */
function collectSavedFileNames(exclude?: string): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  const hiddenSuffix = '__hidden_columns'
  const renamedSuffix = '__renamed_columns'

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (!key) continue
    // Match keys like "basename__hidden_columns" or "basename__renamed_columns"
    const idxH = key.indexOf(hiddenSuffix)
    const idxR = key.indexOf(renamedSuffix)
    if (idxH >= 0 || idxR >= 0) {
      const basename = idxH >= 0 ? key.substring(0, idxH) : key.substring(0, idxR)
      if (basename === exclude) continue
      if (!seen.has(basename)) {
        seen.add(basename)
        result.push(basename)
      }
    }
  }
  return result.sort()
}

/** Populate the saved-files select dropdown. */
function refreshSavedFilesSelect(): void {
  if (!selectSavedFiles) return
  const currentVal = selectSavedFiles.value
  selectSavedFiles.innerHTML = '<option value="">— сохранённые настройки —</option>'
  for (const name of collectSavedFileNames(currentFileName)) {
    const opt = document.createElement('option')
    opt.value = name
    opt.textContent = name
    selectSavedFiles.appendChild(opt)
  }
  // Restore selection if still valid
  if (currentVal && [...selectSavedFiles.options].some(o => o.value === currentVal)) {
    selectSavedFiles.value = currentVal
  }
  // Enable/disable load button
  if (btnLoadSettings) btnLoadSettings.disabled = !selectSavedFiles.value
}

// Load button — apply settings from selected saved file
btnLoadSettings?.addEventListener('click', () => {
  const sourceBasename = selectSavedFiles?.value
  if (!sourceBasename || !compiledResult) return
  const copied = copySettingsFrom(sourceBasename, compiledResult, currentSettings, allColumnKeys)
  currentSettings = copied
  updateBadges()
  saveSettings(currentFileName, currentSettings)
  restoreOriginalLabels(compiledResult)
  render(compiledResult, tableContainer, unknownContainer, errorContainer, currentSettings)
  syncScrollAreas()
  closeColumnSettings()
})

// Enable/disable load button on select change
selectSavedFiles?.addEventListener('change', () => {
  if (btnLoadSettings) btnLoadSettings.disabled = !selectSavedFiles!.value
})

// Dropdown toggle
btnColSettings?.addEventListener('click', (ev) => {
  ev.stopPropagation()
  if (dropdown?.classList.contains('hidden')) {
    openColumnSettings()
  } else {
    closeColumnSettings()
  }
})

// Close dropdown when clicking outside
document.addEventListener('click', (ev) => {
  if (dropdown && !dropdown.contains(ev.target as Node) && !btnColSettings?.contains(ev.target as Node)) {
    closeColumnSettings()
  }
})

// ── File loading ───────────────────────────────────────────────────
fileInput.addEventListener('change', async (ev) => {
  const target = ev.target as HTMLInputElement | null
  const file = target?.files?.[0]
  if (!file) return

  statusBar.textContent = `Загрузка: ${file.name}…`

  // Derive basename for localStorage keys (without extension)
  currentFileName = file.name.replace(/\.(md|markdown)$/i, '')

  try {
    const text = await file.text()
    statusBar.textContent = `Парсинг: ${file.name}…`
    const parsed = parse(text)

    statusBar.textContent = `Группировка: ${file.name}…`
    const grouped = groupTables(parsed)

    statusBar.textContent = `Компиляция: ${file.name}…`
    compiledResult = compile(grouped)

    // Capture original column keys and labels before settings modify them
    allColumnKeys = []
    allColumnLabels = {}
    if (compiledResult) {
      for (const group of compiledResult.groups) {
        for (const col of group.columns) {
          if (!allColumnLabels[col.key]) {
            allColumnKeys.push(col.key)
            allColumnLabels[col.key] = col.label
          }
        }
        if (group.type2Columns) {
          for (const col of group.type2Columns) {
            if (!allColumnLabels[col.key]) {
              allColumnKeys.push(col.key)
              allColumnLabels[col.key] = col.label
            }
          }
        }
      }
    }

    // Load saved settings for this file and apply at renderer stage
    currentSettings = loadSettings(currentFileName)
    restoreOriginalLabels(compiledResult)
    render(compiledResult, tableContainer, unknownContainer, errorContainer, currentSettings)
    syncScrollAreas()
    buildSearchIndex()
    enableControls()
    updateBadges()

    const totalRows = compiledResult.groups.reduce((sum, g) => sum + g.type1Rows.length + g.type2Rows.length, 0)
    statusBar.textContent = `Готово: ${compiledResult.groups.length} групп, ${totalRows} строк, ${compiledResult.errors.length} ошибок`
  } catch (err) {
    statusBar.textContent = `Ошибка: ${err instanceof Error ? err.message : String(err)}`
    errorContainer.innerHTML = `<div class="error-list">❌ ${escapeHtml(err instanceof Error ? err.message : String(err))}</div>`
  }
})

// ── Search ─────────────────────────────────────────────────────────
function rowMatches(row: HTMLTableRowElement, query: string): boolean {
  return row.textContent?.toLowerCase().includes(query) ?? false
}

searchInput.addEventListener('input', () => {
  const query = searchInput.value.trim().toLowerCase()

  const allTbodies = tableContainer.querySelectorAll('.data-tbody') as NodeListOf<HTMLTableSectionElement>
  for (const tbody of allTbodies) {
    const rows = Array.from(tbody.querySelectorAll('tr'))

    if (!query) {
      for (const row of rows) row.classList.remove('hidden')
      continue
    }

    const chunks: HTMLTableRowElement[][] = []
    let chunk: HTMLTableRowElement[] = []
    for (const row of rows) {
      chunk.push(row)
      if (!row.classList.contains('section-row') && !row.classList.contains('text-row')) {
        chunks.push(chunk)
        chunk = []
      }
    }
    if (chunk.length > 0) chunks.push(chunk)

    for (const c of chunks) {
      if (c.length === 0) continue
      const dataRow = c[c.length - 1]
      const contextRows = c.slice(0, -1)

      let textMatchIdx = -1
      for (let i = 0; i < contextRows.length; i++) {
        if (rowMatches(contextRows[i]!, query)) {
          textMatchIdx = i
          break
        }
      }

      const dataMatch = rowMatches(dataRow!, query)

      if (textMatchIdx >= 0) {
        for (let i = 0; i < contextRows.length; i++) {
          contextRows[i]!.classList.toggle('hidden', i < textMatchIdx)
        }
        dataRow!.classList.remove('hidden')
      } else if (dataMatch) {
        for (const row of contextRows) {
          row.classList.remove('hidden')
        }
        dataRow!.classList.remove('hidden')
      } else {
        for (const row of c) row.classList.add('hidden')
      }
    }
  }
})

// ── Export JSON ────────────────────────────────────────────────────
btnJson.addEventListener('click', () => {
  if (!compiledResult) return
  const json = toJSON(compiledResult)
  downloadFile(json, 'tbl_export.json', 'application/json')
})

// ── Helpers ────────────────────────────────────────────────────────
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function enableControls(): void {
  searchInput.disabled = false
  btnJson.disabled = false
  btnTheme.disabled = false
  btnColSettings.disabled = false
}

function buildSearchIndex(): void {
  // No-op: search is DOM-based.
}

function toJSON(compiled: CompiledResult): string {
  const output = compiled.groups.map(g => ({
    groupIndex: g.groupIndex,
    columns: g.columns,
    type1Rows: g.type1Rows,
    type2Rows: g.type2Rows,
  }))
  return JSON.stringify(output, null, 2)
}

function downloadFile(content: string, filename: string, mime: string): void {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
