import { parse } from './public/js/Parser.js'
import { groupTables } from './public/js/PostProcessor.js'
import { compile } from './public/js/Compiler.js'
import { readFileSync } from 'fs'

const md = readFileSync('examples/log_more_short_example3.md', 'utf-8')
console.log('=== INPUT ===')
console.log(md.substring(0, 200) + '...')
console.log()

const parsed = parse(md)
console.log('=== Parsed items ===')
parsed.converted.forEach((item, i) => {
  if (item.type === 'header') console.log(`  [${i}] header level=${item.level} content="${item.content}"`)
  else if (item.type === 'text') console.log(`  [${i}] text content="${item.content}"`)
  else if (item.type === 'table') console.log(`  [${i}] table type=${item.tableType} colCnt=${item.colCnt} headers=[${(item.headers??[]).join('|')}] rows=${item.rows.length}`)
})

console.log('\n=== Groups ===')
const grouped = groupTables(parsed)
grouped.groups.forEach((g, i) => {
  console.log(`Group ${i}: type1Items=${g.type1Items.length}, type2Item=${g.type2Item?'yes':'no'}, headers=${g.headers.length}, texts=${g.texts.length}, tables=${g.tables.length}`)
  g.headers.forEach(h => console.log(`  header: level=${h.level} content="${h.content}"`))
  g.texts.forEach(t => console.log(`  text: content="${t.content}"`))
  g.tables.forEach((tw, ti) => {
    console.log(`  table[${ti}]: items=${tw.items.length}`)
    tw.items.forEach(it => {
      if (it.type === 'header') console.log(`    item: header level=${it.level} content="${it.content}"`)
      else console.log(`    item: text="${it.content}"`)
    })
  })
})

console.log('\n=== Compiled ===')
const compiled = compile(grouped)
compiled.groups.forEach((g, i) => {
  console.log(`Group ${i}: columns=${g.columns.length} type1Rows=${g.type1Rows.length} type2Rows=${g.type2Rows.length} outputRows=${g.outputRows.length}`)
  console.log(`  columns: ${g.columns.map(c => c.key).join(', ')}`)
  g.outputRows.forEach((row, ri) => {
    if (row.kind === 'data') {
      const name = row.dataRow['Название'] || '(empty)'
      const id = row.dataRow['id_element'] || ''
      console.log(`  outputRow[${ri}]: data Название="${name}" id_element="${id}"`)
    } else {
      console.log(`  outputRow[${ri}]: ${row.kind} content="${row.content}"`)
    }
  })
  if (g.type1Rows.length > 0) {
    console.log(`  type1Rows names: ${g.type1Rows.map(r => r['Название'] || '(empty)').join(', ')}`)
  }
})

console.log('\nErrors:', compiled.errors)
