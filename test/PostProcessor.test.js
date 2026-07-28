import { groupTables } from '../public/js/PostProcessor.js'

let passed = 0
let failed = 0
const failures = []

function assert(condition, msg) {
  if (condition) {
    passed++
    console.log(`  ✅ ${msg}`)
  } else {
    failed++
    failures.push(msg)
    console.log(`  ❌ ${msg}`)
  }
}

function makeHeader(level, content) {
  return { type: 'header', level, content }
}

function makeText(content) {
  return { type: 'text', content }
}

function makeTable(type, headers, rows) {
  return {
    type: 'table',
    tableType: type,
    colCnt: headers?.length ?? rows?.[0]?.length ?? 0,
    headers: headers ?? [],
    rows: rows ?? [],
  }
}

// ── Test 1: Simple type-1 → type-2 pairing ──────────────────────────
console.log('\n📦 Test: type-1 → type-2 (one-to-one)')
const parsed1 = {
  converted: [
    makeHeader(5, '1.1.1 Action'),
    makeTable('type-1', ['Поле', 'Описание', 'Значение'], [
      ['Название', 'Action name', 'click_add'],
      ['id_element', 'ID element', 'btn'],
    ]),
    makeTable('type-2', ['*', 'field1', 'field2'], [
      ['', 'f1 desc', 'f2 desc'],
      ['click_add', 'О', 'НО'],
    ]),
  ],
  errors: [],
}
const result1 = groupTables(parsed1)
assert(result1.groups.length === 1, `1 группа (было ${result1.groups.length})`)
assert(result1.groups[0].type1Items.length === 1, `1 type-1 в группе`)
assert(result1.groups[0].type2Item !== undefined, 'type-2 присутствует')
assert(result1.groups[0].tables.length === 1, `1 table in group.tables`)
assert(result1.groups[0].tables[0].items.length === 1, `1 item for table (header)`)
assert(result1.groups[0].headers.length === 1, `1 header в группе (back-compat)`)

// ── Test 2: Multiple type-1 → one type-2 ────────────────────────────
console.log('\n📦 Test: multiple type-1 → one type-2')
const parsed2 = {
  converted: [
    makeTable('type-1', ['Поле', 'Описание', 'Значение'], [
      ['Название', 'Name', 'action1'],
      ['field1', 'F1', 'val1'],
    ]),
    makeTable('type-1', ['Поле', 'Описание', 'Значение'], [
      ['Название', 'Name', 'action2'],
      ['field2', 'F2', 'val2'],
    ]),
    makeTable('type-2', ['*', 'field1', 'field2'], [
      ['', 'f1 desc', 'f2 desc'],
      ['action1', 'О', 'НО'],
      ['action2', 'НО', 'О'],
    ]),
  ],
  errors: [],
}
const result2 = groupTables(parsed2)
assert(result2.groups.length === 1, `1 группа (было ${result2.groups.length})`)
assert(result2.groups[0].type1Items.length === 2, `2 type-1 в группе (было ${result2.groups[0].type1Items.length})`)
assert(result2.groups[0].type2Item !== undefined, 'type-2 присутствует')
assert(result2.groups[0].tables.length === 2, `2 tables in group.tables`)
assert(result2.groups[0].tables[0].items.length === 0, `table 0: 0 items`)
assert(result2.groups[0].tables[1].items.length === 0, `table 1: 0 items`)

// ── Test 3: type-1 without type-2 (end of file) ─────────────────────
console.log('\n📦 Test: type-1 без type-2 (конец файла)')
const parsed3 = {
  converted: [
    makeTable('type-1', ['Поле', 'Описание', 'Значение'], [
      ['Название', 'Name', 'orphan_action'],
    ]),
  ],
  errors: [],
}
const result3 = groupTables(parsed3)
assert(result3.groups.length === 1, `1 группа (было ${result3.groups.length})`)
assert(result3.groups[0].type2Item === undefined, 'type-2 отсутствует')
assert(result3.groups[0].tables.length === 1, `1 table in group.tables`)

// ── Test 4: Unknown tables ──────────────────────────────────────────
console.log('\n📦 Test: unknown таблицы → remainingUnknowns')
const parsed4 = {
  converted: [
    makeTable('type-1', ['Поле', 'Описание', 'Значение'], [
      ['Название', 'Name', 'action1'],
    ]),
    makeTable('unknown', ['x', 'y', 'z'], [['a', 'b', 'c']]),
    makeTable('type-1', ['Поле', 'Описание', 'Значение'], [
      ['Название', 'Name', 'action2'],
    ]),
  ],
  errors: [],
}
const result4 = groupTables(parsed4)
assert(result4.groups.length === 2, `2 группы (было ${result4.groups.length})`)
assert(result4.remainingUnknowns.length === 1, `1 unknown (было ${result4.remainingUnknowns.length})`)

// ── Test 5: Text nodes in groups ────────────────────────────────────
console.log('\n📦 Test: text nodes внутри группы')
const parsed5 = {
  converted: [
    makeTable('type-1', ['Поле', 'Описание', 'Значение'], [
      ['Название', 'Name', 'action1'],
    ]),
    makeText('Какой-то текст между таблицами'),
    makeTable('type-2', ['*', 'f'], [
      ['', 'desc'],
      ['action1', 'О'],
    ]),
  ],
  errors: [],
}
const result5 = groupTables(parsed5)
assert(result5.groups[0].tables[0].items.length === 1, `1 item assigned to table (was ${result5.groups[0].tables[0].items.length})`)
assert(result5.groups[0].tables[0].items[0].type === 'text', 'item type is text')
assert(result5.groups[0].texts.length === 1, `1 text в группе (back-compat, было ${result5.groups[0].texts.length})`)

// ── Test 6: Multiple independent groups ─────────────────────────────
console.log('\n📦 Test: несколько независимых групп')
const parsed6 = {
  converted: [
    makeTable('type-1', ['Поле', 'Описание', 'Значение'], [
      ['Название', 'Name', 'a1'],
    ]),
    makeTable('type-2', ['*', 'f'], [
      ['', 'd'],
      ['a1', 'О'],
    ]),
    makeTable('type-1', ['Поле', 'Описание', 'Значение'], [
      ['Название', 'Name', 'a2'],
    ]),
    makeTable('type-2', ['*', 'f'], [
      ['', 'd'],
      ['a2', 'НО'],
    ]),
  ],
  errors: [],
}
const result6 = groupTables(parsed6)
assert(result6.groups.length === 2, `2 группы (было ${result6.groups.length})`)
assert(result6.groups[0].type1Items.length === 1, 'группа 0: 1 type-1')
assert(result6.groups[1].type1Items.length === 1, 'группа 1: 1 type-1')
assert(result6.groups[0].tables[0].items.length === 0, 'группа 0: 0 items')
assert(result6.groups[1].tables[0].items.length === 0, 'группа 1: 0 items')

// ── Test 7: Empty input ─────────────────────────────────────────────
console.log('\n📦 Test: пустой файл')
const result7 = groupTables({ converted: [], errors: [] })
assert(result7.groups.length === 0, `0 групп`)
assert(result7.remainingUnknowns.length === 0, `0 unknown`)

console.log(`\n${'='.repeat(50)}`)
console.log(`Результат: ${passed} passed, ${failed} failed`)
if (failures.length > 0) {
  console.log('\nНепройденные тесты:')
  failures.forEach(f => console.log(`  ❌ ${f}`))
}
