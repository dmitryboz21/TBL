import type {
  TableNode,
  ColumnDef,
  UnknownTable,
  GroupedResult,
  CompiledResult,
  CompiledGroup,
  CompiledRow,
  OutputRow,
} from './types.js'

/** Normalize string for comparison: strip whitespace, lowercase. */
function normalize(s: string): string {
  return s.replace(/\s+/g, ' ').trim().toLowerCase()
}

/** Remap verbose header names to canonical column identifiers. */
function remapFieldName(field: string): string {
  if (normalize(field) === 'список всех экранов записи лога') return 'page type'
  return field
}

function findColIdx(columns: ColumnDef[], key: string): number {
  const n = normalize(key)
  return columns.findIndex(c => normalize(c.key) === n)
}

function findColKey(columns: ColumnDef[], key: string): string | null {
  const idx = findColIdx(columns, key)
  return idx >= 0 ? columns[idx]!.key : null
}

function getHeaderIndices(table: TableNode): { field: number; desc: number; value: number } {
  const headers = table.headers ?? []
  let field = -1, desc = -1, value = -1
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i]
    if (!h) continue
    const n = normalize(h)
    if (n === 'поле') field = i
    else if (n === 'описание') desc = i
    else if (n === 'значение') value = i
  }
  return { field, desc, value }
}

/**
 * Compile grouped parsed result into per-group table structures.
 *
 * Algorithm (per tz.md §3.4):
 * For each group:
 * 1. Build columns from type-1 "Поле"/"Описание" + type-2 row0 column names.
 * 2. Build type1Rows from type-1 tables, merge O/NO from type-2.
 * 3. Build type2Rows from type-2 data rows (rows 1+, compact matrix).
 */
export function compile(grouped: GroupedResult): CompiledResult {
  const errors: string[] = [...grouped.errors]
  const groups: CompiledGroup[] = []

  for (const group of grouped.groups) {
    const compiled = compileGroup(group, errors)
    groups.push(compiled)
  }

  const unknownTables: UnknownTable[] = grouped.remainingUnknowns

  return { groups, unknownTables, errors }
}

function compileGroup(
  group: import('./types.js').TableGroup,
  errors: string[]
): CompiledGroup {
  const { type1Items, type2Item } = group

  // ── Phase 1: build base columns from type-1 fields ───────────────
  const columns: ColumnDef[] = []
  const seenFields = new Set<string>()

  for (const table of type1Items) {
    const { field: fIdx, desc: dIdx } = getHeaderIndices(table)
    if (fIdx < 0 || dIdx < 0) continue

    for (const row of table.rows) {
      if (row.length <= Math.max(fIdx, dIdx)) continue
      const field = row[fIdx]
      const desc = row[dIdx]
      if (!field) continue
      const canonField = remapFieldName(field)
      if (seenFields.has(canonField)) continue

      seenFields.add(canonField)
      const colDef = desc
        ? { key: canonField, label: canonField, description: desc }
        : { key: canonField, label: canonField, description: '' }
      columns.push(colDef)
    }
  }

  // ── Phase 2: build type1Rows from type-1 tables ─────────────────
  const nameToRowIdx = new Map<string, number>()
  const type1Rows: CompiledRow[] = []

  for (const table of type1Items) {
    const { field: fIdx, value: vIdx } = getHeaderIndices(table)
    if (fIdx < 0 || vIdx < 0) continue

    const row: CompiledRow = {}
    for (const col of columns) row[col.key] = ''

    let nameValue = ''
    for (const dataRow of table.rows) {
      if (dataRow.length <= Math.max(fIdx, vIdx)) continue
      const field = dataRow[fIdx]
      const value = dataRow[vIdx]
      if (!field || !value) continue

      if (normalize(field) === 'название') nameValue = value

      const colKey = findColKey(columns, remapFieldName(field))
      if (colKey) row[colKey] = value
    }

    const idx = type1Rows.length
    type1Rows.push(row)
    if (nameValue) nameToRowIdx.set(nameValue, idx)
  }

  // ── Phase 3: merge type-2 into type1Rows + build type2Rows ──────
  let type2Rows: CompiledRow[] = []
  const type1ExtraColumns: ColumnDef[] = []
  const type2ExtraColumns: ColumnDef[] = []

  if (type2Item) {
    const type2HeaderRow = type2Item.headers ?? []
    const dataRows = type2Item.rows

    // ── Type-1 extra columns: field names from type-2 column 0 ──
    type1ExtraColumns.length = 0
    const seenFieldNames = new Set<string>()
    const SKIP_FIELDS = new Set(['Описание события'])
    for (const dataRow of dataRows) {
      if (dataRow.length < 2) continue
      const fieldName = dataRow[0] ?? ''
      if (!fieldName || seenFieldNames.has(fieldName)) continue
      seenFieldNames.add(fieldName)
      // Skip fields that belong to type-1 base schema
      if (SKIP_FIELDS.has(fieldName)) continue
      // Skip if column already exists in type-1 base columns
      if (findColIdx(columns, fieldName) >= 0) continue
      type1ExtraColumns.push({ key: fieldName, label: fieldName, description: '' })
    }

    // Add type-1 extra columns to the main column list
    for (const col of type1ExtraColumns) {
      if (findColIdx(columns, col.key) < 0) {
        columns.push(col)
      }
    }

    // Ensure all type1Rows have the extra columns
    for (const row of type1Rows) {
      for (const col of type1ExtraColumns) {
        if (!(col.key in row)) row[col.key] = ''
      }
    }

    // ── Type-2 table columns: action names from type-2 row 0 ──
    type2ExtraColumns.length = 0
    for (let j = 1; j < type2HeaderRow.length; j++) {
      const colName = type2HeaderRow[j] ?? ''
      if (!colName || colName === '&nbsp;') continue
      type2ExtraColumns.push({ key: colName, label: colName, description: '' })
    }

    // Ensure all type1Rows have the action columns (for reference)
    for (const row of type1Rows) {
      for (const col of type2ExtraColumns) {
        if (!(col.key in row)) row[col.key] = ''
      }
    }

    // Build normalized set of type-2 actions for error checking
    const type2Actions = new Set<string>()
    for (let j = 1; j < type2HeaderRow.length; j++) {
      const a = type2HeaderRow[j]?.trim()
      if (a && a !== '&nbsp;') type2Actions.add(normalize(a))
    }

    // Track which type-2 actions have at least one matching type-1 row
    const type2ActionsUsed = new Set<string>()

    // ── Merge: type-2 data → type-1 rows ──
    // For each type-1 row (action), find its action in type-2 headers,
    // then for each field extra column, fill O/NO from the matching
    // action column of that field row.
    for (let i = 0; i < type1Rows.length; i++) {
      const t1Row = type1Rows[i]!
      const nameKey = findColKey(columns, 'Название')
      if (!nameKey) continue

      const actionVal = t1Row[nameKey] ?? ''
      const normalizedAction = normalize(actionVal)

      // Find action column index in type-2 headers (1-based: skip placeholder)
      let actionColIdx = -1
      for (let j = 1; j < type2HeaderRow.length; j++) {
        if (normalize(type2HeaderRow[j] ?? '') === normalizedAction) {
          actionColIdx = j
          break
        }
      }
      if (actionColIdx < 0) {
        errors.push(`Action "${actionVal}" из type-1 (группа ${group.groupIndex}) не найден в type-2`)
        continue
      }

      type2ActionsUsed.add(normalizedAction)

      // For each field extra column, find matching data row and fill value
      for (const col of type1ExtraColumns) {
        for (const dataRow of dataRows) {
          if (dataRow[0] === col.key) {
            const value = dataRow[actionColIdx] ?? ''
            if (value !== 'О' && value !== 'НО') {
              errors.push(
                `Не-О/НО значение "${value}" в type-2 (строка "${col.key}", ` +
                `action "${actionVal}", группа ${group.groupIndex})`
              )
            }
            if (!(col.key in t1Row) || t1Row[col.key] === '') t1Row[col.key] = value
            break
          }
        }
      }
    }

    // Report unused type-2 actions
    for (const action of type2Actions) {
      if (!type2ActionsUsed.has(action)) {
        const colName = type2ExtraColumns.find(c => normalize(c.key) === action)?.key
        if (colName) {
          errors.push(`Action "${colName}" из type-2 row 0 не найден в type-1 (группа ${group.groupIndex})`)
        }
      }
    }

    // ── Build type2Rows from data rows ──
    type2Rows = []
    for (const dataRow of dataRows) {
      if (dataRow.length < 2) continue

      const t2Row: CompiledRow = {}
      for (const col of type2ExtraColumns) t2Row[col.key] = ''
      t2Row['column1_value'] = dataRow[0] ?? ''

      for (let j = 0; j < type2ExtraColumns.length && (j + 1) < dataRow.length; j++) {
        t2Row[type2ExtraColumns[j]!.key] = dataRow[j + 1] ?? ''
      }

      type2Rows.push(t2Row)
    }
  }

  // ── Phase 4: build outputRows (text/header + data interleaved) ───
  const outputRows: OutputRow[] = []
  let tableIdx = 0

  for (const tableContent of group.tables) {
    // Emit text/header rows before this table's data
    for (const item of tableContent.items) {
      if (item.type === 'header') {
        outputRows.push({ kind: 'header', level: item.level, content: item.content })
      } else {
        outputRows.push({ kind: 'text', content: item.content })
      }
    }

    // Emit compiled data row for this table
    if (tableIdx < type1Rows.length) {
      outputRows.push({ kind: 'data', dataRow: type1Rows[tableIdx]! })
    }
    tableIdx++
  }

  const result: CompiledGroup = {
    groupIndex: group.groupIndex,
    columns,
    type1Rows,
    type2Rows,
    type2Columns: type2Item ? [{ key: 'column1_value', label: 'column1_value', description: '' }, ...type2ExtraColumns] : [],
    outputRows,
  }
  if (type2Item) result.type2Item = type2Item
  return result
}
