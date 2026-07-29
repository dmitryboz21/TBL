import type {
  ParsedResult,
  TableNode,
  HeaderNode,
  TextNode,
  GroupedResult,
  TableGroup,
  UnknownTable,
} from './types.js'

/** A single table with its associated text/header items in order of encounter. */
interface TableWithContent {
  table: TableNode
  /** Text and header items between this table and the next (or group boundary). */
  items: (HeaderNode | TextNode)[]
}

/**
 * Group parsed items into TableGroup structures using a stack-based approach.
 *
 * Algorithm (per tz.md §3.3):
 * 1. Iterate through `parsed.converted[]` sequentially.
 * 2. type-1 → push onto stack; if stack was empty, assign new groupIndex.
 * 3. type-2 → assign current groupIndex to all type-1s on stack, clear stack.
 * 4. unknown → collect, clear stack (and current group).
 * 5. header/text → buffer into pendingItems.
 * 6. End of file → flush remaining stack into a new group (no type-2).
 */
export function groupTables(parsed: ParsedResult): GroupedResult {
  const groups: TableGroup[] = []
  const remainingUnknowns: UnknownTable[] = []
  const errors: string[] = [...parsed.errors]

  const pendingItems: (HeaderNode | TextNode)[] = []
  const bufferedHeaders: HeaderNode[] = []
  const bufferedTexts: TextNode[] = []

  let currentGroup: TableGroup | null = null
  let groupIndex = 0

  const getGroup = (): TableGroup | null => currentGroup

  const createGroup = (): TableGroup => {
    const grp: TableGroup = {
      groupIndex,
      type1Items: [],
      headers: [...bufferedHeaders],
      texts: [...bufferedTexts],
      tables: [],
    }
    bufferedHeaders.length = 0
    bufferedTexts.length = 0
    groups.push(grp)
    groupIndex++
    currentGroup = grp
    return grp
  }

  for (const item of parsed.converted) {
    switch (item.type) {
      case 'table': {
        switch (item.tableType) {
          case 'type-1': {
            const grp = getGroup()
            if (grp && grp.type2Item) {
              // Current group already has type-2 → start a new group
              const newGrp = createGroup()
              newGrp.tables.push({ table: item, items: [...pendingItems] })
              newGrp.type1Items.push(item)
            } else {
              // No group yet, or group without type-2 → extend current
              const currentGrp = grp ?? createGroup()
              currentGrp.tables.push({ table: item, items: [...pendingItems] })
              currentGrp.type1Items.push(item)
            }
            pendingItems.length = 0
            break
          }

          case 'type-2': {
            const grp = getGroup()
            if (grp && grp.tables.length > 0) {
              // Assign pending items to the last table before type-2
              const last = grp.tables[grp.tables.length - 1]
              if (last) {
                last.items.push(...pendingItems)
              }
              grp.type2Item = item
            }
            pendingItems.length = 0
            break
          }

          case 'unknown': {
            remainingUnknowns.push({ markdown: '', cells: item.rows })
            const grp = getGroup()
            if (grp && grp.tables.length > 0) {
              const last = grp.tables[grp.tables.length - 1]
              if (last) {
                last.items.push(...pendingItems)
              }
            }
            pendingItems.length = 0
            currentGroup = null
            break
          }
        }
        break
      }

      case 'header': {
        const grp = getGroup()
        if (grp) {
          grp.headers.push(item)
        } else {
          bufferedHeaders.push(item)
        }
        pendingItems.push(item)
        break
      }

      case 'text': {
        const grp = getGroup()
        if (grp) {
          grp.texts.push(item)
        } else {
          bufferedTexts.push(item)
        }
        pendingItems.push(item)
        break
      }
    }
  }

  // Flush remaining pending items to the last table at end of file
  const finalGrp = getGroup()
  if (finalGrp && finalGrp.tables.length > 0 && pendingItems.length > 0) {
    const last = finalGrp.tables[finalGrp.tables.length - 1]
    if (last) {
      last.items.push(...pendingItems)
    }
  }

  return { groups, remainingUnknowns, errors }
}
