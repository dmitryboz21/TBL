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
 * 2. type-1 → create new table entry in grp.tables, assign pendingItems to it.
 * 3. type-2 → close group: assign pendingItems to the last table, set type2Item.
 * 4. header/text → buffer into pendingItems; will be assigned when next type-1
 *    or group boundary is encountered.
 * 5. unknown → flush pending to last table, add to remainingUnknowns.
 * 6. End of file → flush pending to last table.
 */
export function groupTables(parsed: ParsedResult): GroupedResult {
  const groups: TableGroup[] = []
  const remainingUnknowns: UnknownTable[] = []
  const errors: string[] = [...parsed.errors]

  const pendingStack: TableNode[] = []
  const pendingItems: (HeaderNode | TextNode)[] = []
  const bufferedHeaders: HeaderNode[] = []
  const bufferedTexts: TextNode[] = []

  let currentGroup: TableGroup | null = null
  let groupIndex = 0

  const getGroup = (): TableGroup | null => currentGroup

  const createGroup = () => {
    const grp: TableGroup = {
      groupIndex,
      type1Items: pendingStack.slice(),
      headers: [...bufferedHeaders],
      texts: [...bufferedTexts],
      tables: [],
    }
    bufferedHeaders.length = 0
    bufferedTexts.length = 0
    groups.push(grp)
    groupIndex++
    currentGroup = grp
  }

  for (const item of parsed.converted) {
    switch (item.type) {
      case 'table': {
        switch (item.tableType) {
          case 'type-1': {
            // Current group is already closed by a type-2 → start new group
            if (currentGroup && (currentGroup as TableGroup).type2Item) {
              currentGroup = null
            }
            if (!currentGroup) {
              createGroup()
            }
            const grp = getGroup()!
            // Assign buffered items to THIS new table (items that appeared
            // after the previous table but before this one belong to this one)
            grp.tables.push({ table: item, items: [...pendingItems] })
            pendingItems.length = 0
            pendingStack.push(item)
            break
          }

          case 'type-2': {
            const grp = getGroup()
            if (grp) {
              // Assign pending items to the last table before type-2
              if (grp.tables.length > 0) {
                const last = grp.tables[grp.tables.length - 1]
                if (last) {
                  last.items.push(...pendingItems)
                }
              }
              // Add remaining pending tables
              for (const table of pendingStack) {
                grp.type1Items.push(table)
              }
              grp.type2Item = item
            }
            pendingStack.length = 0
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
            pendingStack.length = 0
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

  // Flush remaining pending items at end of file
  const finalGrp = getGroup()
  if (finalGrp && finalGrp.tables.length > 0 && pendingItems.length > 0) {
    const last = finalGrp.tables[finalGrp.tables.length - 1]
    if (last) {
      last.items.push(...pendingItems)
    }
    pendingItems.length = 0
  }

  return { groups, remainingUnknowns, errors }
}
