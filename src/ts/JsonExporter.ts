import type { CompiledResult, ColumnSettings } from './types.js'
import { applySettings } from './ColumnSettings.js'

/** Escape the closing-sequence inside a JSONC comment to avoid premature termination. */
function escapeComment(content: string): string {
  return content.replace(/\*\//g, '*\\/')
}

/** Escape a string for use inside a JSON double-quoted value. */
function escapeJsonValue(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
}

/**
 * Format a data row as a JS object-like string (like console.log output).
 * Keys are column labels (after rename), values are trimmed.
 * Empty cells are skipped.
 */
function formatDataRow(
  row: Record<string, string>,
  columns: Array<{ key: string; label: string }>
): string {
  const entries: string[] = []
  for (const col of columns) {
    const value = (row[col.key] ?? '').trim()
    if (value) {
      entries.push('  "' + escapeJsonValue(col.label) + '": "' + escapeJsonValue(value) + '"')
    }
  }
  if (entries.length === 0) return '{}'
  return '{\n' + entries.join(',\n') + '\n}'
}

/**
 * Export compiled result to JSONC (JSON with comments) format.
 *
 * Rules:
 * - Single-column rows (text/header with colspan) -> comment wrapping the content
 * - Multi-column rows (data rows) -> JS object-like string
 * - Type-2 matrices are not exported
 * - Hidden columns are excluded
 * - Renamed columns use their alternative names as keys
 */
export function toJsonc(compiled: CompiledResult, settings: ColumnSettings): string {
  // Deep-copy to avoid mutating the original compiled result
  const result = JSON.parse(JSON.stringify(compiled)) as CompiledResult
  applySettings(result, settings)

  const lines: string[] = []

  for (let gi = 0; gi < result.groups.length; gi++) {
    const group = result.groups[gi]!

    // Header object with column descriptions
    const descEntries = group.columns
      .filter(col => col.description)
      .map(col => '  "' + escapeJsonValue(col.label) + '": "' + escapeJsonValue(col.description) + '"')
    if (descEntries.length > 0) {
      lines.push('{\n' + descEntries.join(',\n') + '\n}')
    }

    for (const row of group.outputRows) {
      switch (row.kind) {
        case 'header':
        case 'text':
          lines.push('/* ' + escapeComment(row.content.trim()) + ' */')
          break
        case 'data':
          lines.push(formatDataRow(row.dataRow, group.columns))
          break
      }
    }

    // Blank line between groups
    if (gi < result.groups.length - 1) {
      lines.push('')
    }
  }

  return lines.join('\n')
}
