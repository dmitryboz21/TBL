// ============================================================================
// Parser — result types
// ============================================================================

export interface ParsedResult {
  converted: ParsedItem[]
  errors: string[]
}

export type ParsedItem = HeaderNode | TableNode | TextNode

export interface HeaderNode {
  type: 'header'
  level: number
  content: string
}

export interface TableNode {
  type: 'table'
  tableType: 'type-1' | 'type-2' | 'unknown'
  colCnt: number
  headers?: string[] | undefined
  rows: string[][]
}

export interface TextNode {
  type: 'text'
  content: string
}

// ============================================================================
// PostProcessor — grouping types
// ============================================================================

export interface GroupedResult {
  groups: TableGroup[]
  remainingUnknowns: UnknownTable[]
  errors: string[]
}

/** A table with its associated text/header items in order of encounter. */
export interface TableWithContent {
  table: TableNode
  /** Text and header items between this table and the next (or group boundary). */
  items: (HeaderNode | TextNode)[]
}

export interface TableGroup {
  groupIndex: number
  type1Items: TableNode[]
  type2Item?: TableNode
  headers: HeaderNode[]
  texts: TextNode[]
  /** Per-table items — used by Compiler to build outputRows. */
  tables: TableWithContent[]
}

// ============================================================================
// Compiler — result types
// ============================================================================

export interface CompiledResult {
  groups: CompiledGroup[]
  unknownTables: UnknownTable[]
  errors: string[]
}

export interface TextOrHeaderRow {
  type: 'header' | 'text'
  level?: number
  content: string
}

/** Discriminated union: data row vs text row vs header row. */
export type OutputRow =
  | { kind: 'data'; dataRow: CompiledRow }
  | { kind: 'text'; content: string }
  | { kind: 'header'; level: number; content: string }

export interface CompiledGroup {
  groupIndex: number
  columns: ColumnDef[]
  type1Rows: CompiledRow[]
  type2Rows: CompiledRow[]
  type2Columns: ColumnDef[]
  type2Item?: TableNode
  /** All rows to render in the type-1 table body, in order. */
  outputRows: OutputRow[]
}

export type CompiledRow = Record<string, string>

export interface ColumnDef {
  key: string
  label: string
  description: string
}

export interface SectionHeader {
  level: number
  content: string
}

export interface UnknownTable {
  markdown: string
  cells: string[][]
}

// ============================================================================
// Renderer helpers
// ============================================================================

export type HighlightType = 'ok' | 'no' | 'text'

export interface RenderContext {
  compiled: CompiledResult
  container: HTMLElement
  unknownContainer: HTMLElement
  errorContainer: HTMLElement
}
