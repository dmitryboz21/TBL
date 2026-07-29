import type { CompiledResult, ColumnSettings } from './types.js'

const HIDDEN_SUFFIX = '__hidden_columns'
const RENAMED_SUFFIX = '__renamed_columns'

/** Build localStorage key from file basename and setting type. */
export function getStorageKey(fileName: string, type: 'hidden' | 'renamed'): string {
  return fileName + (type === 'hidden' ? HIDDEN_SUFFIX : RENAMED_SUFFIX)
}

/** Load column settings from localStorage for the given file basename. */
export function loadSettings(fileName: string): ColumnSettings {
  const hiddenRaw = localStorage.getItem(getStorageKey(fileName, 'hidden'))
  const renamedRaw = localStorage.getItem(getStorageKey(fileName, 'renamed'))
  return {
    hidden: hiddenRaw ? JSON.parse(hiddenRaw) : [],
    renamed: renamedRaw ? JSON.parse(renamedRaw) : {},
  }
}

/** Save column settings to localStorage for the given file basename. */
export function saveSettings(fileName: string, settings: ColumnSettings): void {
  localStorage.setItem(getStorageKey(fileName, 'hidden'), JSON.stringify(settings.hidden))
  localStorage.setItem(getStorageKey(fileName, 'renamed'), JSON.stringify(settings.renamed))
}

/**
 * Apply hidden/renamed column settings to a compiled result.
 * Modifies `compiled` in-place (columns arrays and labels).
 * Called at renderer stage, never before.
 */
export function applySettings(compiled: CompiledResult, settings: ColumnSettings): void {
  const hiddenSet = new Set(settings.hidden)
  const renamedMap = settings.renamed

  for (const group of compiled.groups) {
    // Filter out hidden columns from the main column list
    group.columns = group.columns.filter(col => !hiddenSet.has(col.key))
    // Apply renamed labels
    for (const col of group.columns) {
      const newLabel = renamedMap[col.key]
      if (newLabel) col.label = newLabel
    }

    // Also apply to type-2 columns if present
    if (group.type2Item && group.type2Columns) {
      group.type2Columns = group.type2Columns.filter(col => !hiddenSet.has(col.key))
      for (const col of group.type2Columns) {
        const newLabel = renamedMap[col.key]
        if (newLabel) col.label = newLabel
      }
    }
  }
}

/**
 * Collect all unique column keys across all groups, preserving order of first appearance.
 */
export function collectAllColumnKeys(compiled: CompiledResult): string[] {
  const seen = new Set<string>()
  const result: string[] = []

  for (const group of compiled.groups) {
    for (const col of group.columns) {
      if (!seen.has(col.key)) {
        seen.add(col.key)
        result.push(col.key)
      }
    }
    if (group.type2Columns) {
      for (const col of group.type2Columns) {
        if (!seen.has(col.key)) {
          seen.add(col.key)
          result.push(col.key)
        }
      }
    }
  }
  return result
}

/**
 * Load settings from another file's localStorage entry and apply them to current settings.
 * Only keys that exist in current compiled data are kept.
 * @param currentAllKeys Optional pre-computed full key set (includes hidden columns). If omitted, uses collectAllColumnKeys on compiled (which may miss hidden columns).
 */
export function copySettingsFrom(
  sourceFileName: string,
  compiled: CompiledResult,
  targetSettings: ColumnSettings,
  currentAllKeys?: string[]
): ColumnSettings {
  const currentKeys = new Set(currentAllKeys ?? collectAllColumnKeys(compiled))
  const source = loadSettings(sourceFileName)

  // Keep only overlapping hidden keys
  const hidden: string[] = source.hidden.filter(k => currentKeys.has(k))
  // Keep only overlapping renamed keys
  const renamed: Record<string, string> = {}
  for (const [key, label] of Object.entries(source.renamed)) {
    if (currentKeys.has(key)) {
      renamed[key] = label
    }
  }

  return { hidden, renamed }
}
