import { parse } from './Parser.js'
import { groupTables } from './PostProcessor.js'
import { compile } from './Compiler.js'
import { render } from './Renderer.js'
import type { CompiledResult } from './types.js'

// ── State ──────────────────────────────────────────────────────────
let compiledResult: CompiledResult | null = null

// ── DOM references ─────────────────────────────────────────────────
const fileInput    = document.getElementById('file-input')    as HTMLInputElement
const searchInput  = document.getElementById('search-input')  as HTMLInputElement
const btnJson      = document.getElementById('btn-export-json')as HTMLButtonElement
const btnTheme     = document.getElementById('btn-theme')     as HTMLButtonElement
const statusBar    = document.getElementById('status-bar')    as HTMLDivElement
const tableContainer    = document.getElementById('table-container')    as HTMLDivElement
const unknownContainer  = document.getElementById('unknown-container')  as HTMLDivElement
const errorContainer  = document.getElementById('error-container')  as HTMLDivElement

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

// Init theme on load
applyTheme(getSavedTheme())

// Theme toggle button
btnTheme.addEventListener('click', toggleTheme)

// ── Sticky scroll sync ─────────────────────────────────────────────
function syncScrollAreas(): void {
  const wrappers = document.querySelectorAll('.summary-table-wrapper')
  for (const wrapper of wrappers) {
    const scrollArea = wrapper.querySelector('.table-scroll-area') as HTMLElement
    const shim = wrapper.querySelector('.sticky-scroll-shim') as HTMLElement
    const shimInner = shim.querySelector('.inner') as HTMLElement
    if (!scrollArea || !shimInner) continue

    // Sync shim inner width to scroll area scrollWidth
    shimInner.style.width = scrollArea.scrollWidth + 'px'

    // Scroll shim → sync scroll area
    shim.addEventListener('scroll', () => {
      scrollArea.scrollLeft = shim.scrollLeft
    })

    // Scroll scroll area → sync shim
    scrollArea.addEventListener('scroll', () => {
      shim.scrollLeft = scrollArea.scrollLeft
    })
  }
}



// ── File loading ───────────────────────────────────────────────────
fileInput.addEventListener('change', async (ev) => {
  const target = ev.target as HTMLInputElement | null
  const file = target?.files?.[0]
  if (!file) return

  statusBar.textContent = `Загрузка: ${file.name}…`
  try {
    const text = await file.text()
    statusBar.textContent = `Парсинг: ${file.name}…`
    const parsed = parse(text)

    statusBar.textContent = `Группировка: ${file.name}…`
    const grouped = groupTables(parsed)

    statusBar.textContent = `Компиляция: ${file.name}…`
    compiledResult = compile(grouped)
    render(compiledResult, tableContainer, unknownContainer, errorContainer)
    syncScrollAreas()
    buildSearchIndex()
    enableControls()

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

    // No query — show everything
    if (!query) {
      for (const row of rows) row.classList.remove('hidden')
      continue
    }

    // Chunk rows: [context rows (header/text)..., data row]
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

    // Process each chunk
    for (const c of chunks) {
      if (c.length === 0) continue
      const dataRow = c[c.length - 1]
      const contextRows = c.slice(0, -1)

      // Find first matching context row index
      let textMatchIdx = -1
      for (let i = 0; i < contextRows.length; i++) {
        if (rowMatches(contextRows[i]!, query)) {
          textMatchIdx = i
          break
        }
      }

      // Check if data row matches
      const dataMatch = rowMatches(dataRow!, query)

      if (textMatchIdx >= 0) {
        // Match in text/header → show matched row + following rows + data row, stop
        for (let i = 0; i < contextRows.length; i++) {
          contextRows[i]!.classList.toggle('hidden', i < textMatchIdx)
        }
        dataRow!.classList.remove('hidden')
      } else if (dataMatch) {
        // Match in data row → show data row + all preceding context rows, stop
        for (const row of contextRows) {
          row.classList.remove('hidden')
        }
        dataRow!.classList.remove('hidden')
      } else {
        // No match — hide everything
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
}

function buildSearchIndex(): void {
  // No-op: search is DOM-based (directly queries tbody on each input event).
}

/** Convert all groups' data to JSON string. */
function toJSON(compiled: CompiledResult): string {
  const output = compiled.groups.map(g => ({
    groupIndex: g.groupIndex,
    columns: g.columns,
    type1Rows: g.type1Rows,
    type2Rows: g.type2Rows,
  }))
  return JSON.stringify(output, null, 2)
}

/** Trigger a browser file download. */
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
