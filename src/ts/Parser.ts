import type { ParsedResult, ParsedItem, HeaderNode, TableNode, TextNode } from './types.js'

// ============================================================================
// Sanitization
// ============================================================================

/**
 * Sanitize cell value: strip markdown formatting, escape sequences, whitespace.
 */
export function sanitize(value: string): string {
  return cleanText(value
    .replaceAll(/page\stype:\s/g, '')
    .replaceAll(/\*/g, '')
    .replaceAll(/&nbsp;/g, ' ')
    .replaceAll(/\\\[/g, '[')
    .replaceAll(/\\\]/g, ']')
    .replaceAll(/\\\{/g, '{')
    .replaceAll(/\\\}/g, '}')
    .replaceAll(/\\\|/g, '|')
    .replaceAll(/\\n/g, '')
    .replaceAll(/\\t/g, ' ')
    .replaceAll(/\\/g, '')
    .replaceAll(/\r\n/g, '\n')
    .replaceAll(/\s+/g, ' ')
    ).trim()


  
}

// ============================================================================
// Non-table line classification
// ============================================================================

/**
 * Cleanup TextNode content: strip `**`, expand `{green}(...)`, etc.
 */
export function cleanText(content: string): string {
  let result = content.trim()
  // Strip \ → . (escaped dot)
  result = result.replace(/\\\./g, '.')
  // Strip **
  result = result.replace(/\*\*/g, '')
  // {green}(...) → (...)
  result = result.replace(/\{(gray|yellow|orange|red|green|blue|violet)\}\(([^)]*)\)/g, '$2')
  // Remove {% endcut %}
  result = result.replaceAll('{% endcut %}', '')
  // Remove &nbsp;
  result = result.replaceAll('&nbsp;', ' ')
  return result.trim()
}

/**
 * Extract content from a `{% cut "..." %}` marker line.
 * Returns null if the line is not a cut marker.
 */
export function extractCutContent(line: string): string | null {
  const trimmed = line.trim()
  if (!trimmed.startsWith('{% cut')) return null
  const match = trimmed.match(/\{%\s+cut\s+(.+?)\s*%\}/)
  if (!match) return null
  let inner = match[1]!.trim()
  // Remove surrounding quotes if present
  if ((inner.startsWith('"') && inner.endsWith('"')) ||
      (inner.startsWith("'") && inner.endsWith("'"))) {
    inner = inner.slice(1, -1)
  }
  return cleanText(inner)
}

/**
 * Classify a non-table line: header, {% cut %} → H2, or text.
 */
export function classifyNonTableCell(line: string): HeaderNode | TextNode | null {
  const trimmed = line.trim()
  if (trimmed === '') return null

  // Check for {% cut %} block markers → HeaderNode level 2
  const cutContent = extractCutContent(trimmed)
  if (cutContent !== null) {
    return { type: 'header', level: 2, content: cutContent }
  }

  // Check for markdown heading
  const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/)
  if (headingMatch) {
    return {
      type: 'header',
      level: headingMatch[1]!.length,
      content: cleanText(headingMatch[2]!),
    }
  }

  return { type: 'text', content: cleanText(trimmed) }
}

// ============================================================================
// Table helpers (internal)
// ============================================================================

/**
 * Extract table cells from raw lines within table boundaries (inclusive).
 *
 * Format:
 *   `|` on its own line  — cell separator
 *   `||` on its own line — row end (start of next row)
 *   Empty lines          — skipped
 *   Anything else        — cell content (may span multiple lines)
 */
export function extractCells(lines: string[], start: number, end: number): string[][] {
  const rows: string[][] = []
  const currentRow: string[] = []
  const currentCellParts: string[] = []

  const flushCell = () => {
    const cell = currentCellParts.join('\n').trim()
    if (cell !== '' || currentRow.length>0) {
      currentRow.push(sanitize(cell))
    }
    currentCellParts.length = 0
  }

  const flushRow = () => {
    flushCell()
    if (currentRow.length > 0) {
      rows.push([...currentRow])  // copy, not reference!
    }
    currentRow.length = 0
  }

  for (let i = start; i <= end; i++) {
    const trimmed = lines[i]!.trim()

    if (trimmed === '' && currentCellParts.length===0) {
      // skip empty lines
      continue
    } else if (trimmed === '|') {
      // cell separator — finish current cell, start next
      flushCell()
    } else if (trimmed === '||') {
      // row end — finish current cell and row
      flushCell()
      flushRow()
    } else {
      // cell content (may accumulate across multiple lines)
      currentCellParts.push(trimmed)
    }
  }

  // Flush any remaining cell/row
  flushCell()
  flushRow()

  return rows
}

/**
 * Classify a table based on its first row (headers) and content.
 *
 * - type-1: headers match {"Поле", "Описание", "Значение"} (case-insensitive, stripped)
 * - type-2: contains "О" or "НО" values anywhere
 * - unknown: neither
 */
export function classifyTable(headers: string[], rows: string[][]): 'type-1' | 'type-2' | 'unknown' {
  // Type-1: exact field-descriptor table
  const normalizedHeaders = headers.map(h => sanitize(h).toLowerCase())
  if (
    normalizedHeaders.length >= 3 &&
    normalizedHeaders[0] === 'поле' &&
    normalizedHeaders[1] === 'описание' &&
    normalizedHeaders[2] === 'значение'
  ) {
    return 'type-1'
  }

  // Type-2: contains "О" or "НО" values
  for (const row of rows) {
    for (const cell of row) {
      const s = sanitize(cell).toUpperCase()
      if (s === 'О' || s === 'НО') return 'type-2'
    }
  }

  return 'unknown'
}

// ============================================================================
// Main parser — single pass, line by line
// ============================================================================

/**
 * Main parser entry point.
 *
 * Reads lines top-to-bottom, switching between "text" mode and "table" mode.
 *   - Outside a table: headers (`#...`) and text via `classifyNonTableCell`
 *   - Inside a table: `#|` start → accumulate cells → `|#` end → classify → emit TableNode
 *
 * Control characters inside tables:
 *   `|` — cell separator
 *   `||` — row separator
 *   empty lines — ignored
 *   everything else — cell content (may span multiple lines)
 */
export function parse(mdText: string): ParsedResult {
  const lines = mdText.split('\n')
  const converted: ParsedItem[] = []
  const errors: string[] = []

  let i = 0
  while (i < lines.length) {
    const trimmed = lines[i]!.trim()

    // --- TABLE START: `#|` on its own line ---
    if (trimmed === '#|') {
      // Find table end: `|#` on its own line
      let j = i + 1
      while (j < lines.length && lines[j]!.trim() !== '|#') {
        j++
      }

      if (j < lines.length) {
        // Table content is between i+1 and j-1 (exclusive of markers)
        const rawRows = extractCells(lines, i + 1, j - 1)

        // First row = headers, remaining = data
        const headers: string[] = rawRows[0] ?? []
        const dataRows: string[][] = headers.length > 0 ? rawRows.slice(1) : []

        const tableType = classifyTable(headers, dataRows)

        const tableNode: TableNode = {
          type: 'table',
          tableType,
          colCnt: headers.length,
          ...(headers.length > 0 ? { headers } : {}),
          rows: dataRows,
        }

        if (tableType !== 'type-1' && tableType !== 'type-2') {
          errors.push(`Unknown table at line ${i + 1}: ${(headers ?? []).join(', ')}`)
        }

        converted.push(tableNode)

        // Skip past the `|#` marker
        i = j + 1
      } else {
        // Unclosed table — emit error, continue as text
        errors.push(`Unclosed table start at line ${i + 1}`)
        converted.push(classifyNonTableCell(lines[i]!) ?? { type: 'text', content: trimmed })
        i++
      }
      continue
    }

    // --- NON-TABLE CONTENT ---
    const node = classifyNonTableCell(lines[i]!)
    if (node) {
      converted.push(node)
    }
    i++
  }

  return { converted, errors }
}
