import { parse, sanitize, classifyNonTableCell, extractCells, classifyTable, cleanText, extractCutContent } from '../public/js/Parser.js'
import { readFileSync } from 'fs'

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

console.log('\n🧹 sanitize()')
assert(sanitize('**текст**') === 'текст', 'Убирает **')
assert(sanitize('  текст  ') === 'текст', 'trim()')
assert(sanitize('a&nbsp;b') === 'a b', '&nbsp; внутри текста → пробел')
assert(sanitize('\\[bracket\\]') === '[bracket]', 'Экранированные скобки')
assert(sanitize('\\{braces\\}') === '{braces}', 'Экранированные скобки')
assert(sanitize('  hello   world  ') === 'hello world', 'multiple spaces → single')

console.log('\n🧹 cleanText()')
assert(cleanText('**текст**') === 'текст', 'Убирает ** из текста')
assert(cleanText('{green}(1.1. "Тест")') === '(1.1. "Тест")', '{green}(...) → (...)')
assert(cleanText('Обычный текст') === 'Обычный текст', 'Обычный текст без изменений')
assert(cleanText('  **с пробелами**  ') === 'с пробелами', 'trim + **')

console.log('\n✂️ extractCutContent()')
assert(extractCutContent('{% cut "Тест" %}') === 'Тест', 'Извлекает текст из {% cut %}')
assert(extractCutContent('{% cut "(1.1. \"Тест\")" %}') === '(1.1. "Тест")', 'Извлекает с кавычками')
assert(extractCutContent('Обычный текст') === null, 'Не cut → null')
assert(extractCutContent('') === null, 'Пустая строка → null')
assert(extractCutContent('###### H6') === null, 'Заголовок → null')

console.log('\n📝 classifyNonTableCell()')
const h1 = classifyNonTableCell('# Заголовок')
assert(h1?.type === 'header' && h1.level === 1 && h1.content === 'Заголовок', 'H1 заголовок')
const h6 = classifyNonTableCell('###### H6')
assert(h6?.type === 'header' && h6.level === 6 && h6.content === 'H6', 'H6 заголовок')
const h5 = classifyNonTableCell('##### 1.1.1 Нажатие на кнопку')
assert(h5?.type === 'header' && h5.level === 5, 'H5 заголовок с текстом')
const cut = classifyNonTableCell('{% cut "**текст**" %}')
assert(cut?.type === 'header' && cut.level === 2 && cut.content === 'текст', '{% cut %} → HeaderNode(level: 2)')
const cutGreen = classifyNonTableCell('{% cut "{green}(1.1. \"Тест\")" %}')
assert(cutGreen?.type === 'header' && cutGreen.level === 2, '{% cut %} с {green} → H2')
const text = classifyNonTableCell('Обычный текст')
assert(text?.type === 'text' && text.content === 'Обычный текст', 'Обычный текст')
const empty = classifyNonTableCell('')
assert(empty === null, 'Пустая строка → null')

console.log('\n📊 extractCells()')
const cells1 = extractCells(['', '||', '**Поле**', '|', '**Описание**', '|', '**Значение**', '||', '||'], 0, 8)
assert(cells1.length === 1, `1 строка (было ${cells1.length})`)
assert(cells1[0].length === 3, `3 ячейки: ${cells1[0].join(', ')}`)
assert(cells1[0][0] === 'Поле', 'Первая ячейка "Поле"')
const cells2 = extractCells(['', '||', '**A**', '|', '**B**', '|', '**C**', '||', '||', '**X**', '|', '**Y**', '|', '**Z**', '||', '||'], 0, 15)
assert(cells2.length === 2, `2 строки (было ${cells2.length})`)
assert(cells2[0].join(',') === 'A,B,C', 'Строка 1: A,B,C')
assert(cells2[1].join(',') === 'X,Y,Z', 'Строка 2: X,Y,Z')
const emptyTable = extractCells(['', '||', '||'], 0, 2)
assert(emptyTable.length === 0, `Пустая таблица → 0 строк (было ${emptyTable.length})`)

console.log('\n🏷️ classifyTable()')
const type1Result = classifyTable(['Поле', 'Описание', 'Значение'], [['name', 'desc', 'val']])
assert(type1Result === 'type-1', 'type-1 по заголовкам')
const type2Result = classifyTable(['*', 'action1'], [['field', 'О', 'НО']])
assert(type2Result === 'type-2', 'type-2 по О/НО')
const unknownResult = classifyTable(['col1', 'col2', 'col3'], [['a', 'b', 'c']])
assert(unknownResult === 'unknown', 'unknown: нет О/НО')
const type2Insensitive = classifyTable(['поле', 'описание', 'значение'], [['f', 'о', 'v']])
assert(type2Insensitive === 'type-1', 'type-1 регистронезависимо')

console.log('\n📦 parse() — full file')
const md = readFileSync('examples/log_tz_short.md', 'utf-8')
const result = parse(md)
assert(result.converted.length > 0, 'Есть элементы (всего: ' + result.converted.length + ')')
assert(result.errors.length === 0, `Нет ошибок (было: ${result.errors.length})`)
const types = { header: 0, text: 0, table: 0 }
for (const item of result.converted) types[item.type]++
assert(types.header >= 10, `Много заголовков (${types.header})`)
assert(types.table >= 10, `Много таблиц (${types.table})`)
assert(types.text >= 1, `Есть текстовые блоки (${types.text})`)
for (const item of result.converted) {
  if (item.type === 'table' && item.tableType === 'type-1') {
    assert(item.colCnt === 3, `Table cols=3 (${item.colCnt})`)
    assert(item.headers !== undefined, `Table has headers`)
    assert(item.rows.length > 0, `Table has rows (${item.rows.length})`)
  }
}

console.log('\n📦 parse() — edge cases')
const emptyResult = parse('')
assert(emptyResult.converted.length === 0, 'Пустой файл → 0 элементов')
const headersOnly = parse('# H1\n## H2\n### H3')
const headersTypes = { header: 0 }
for (const item of headersOnly.converted) headersTypes.header++
assert(headersTypes.header === 3, 'Только заголовки: 3 header')
const tableOnly = '#|\n||\n**A**\n|\n**B**\n|\n**C**\n||\n||\n|#'
const tableResult = parse(tableOnly)
assert(tableResult.converted.length === 1, 'Только таблица: 1 элемент')
assert(tableResult.converted[0].type === 'table', 'Тип: table')
const unclosedTable = '#|\n||\n**A**\n|\n**B**\n|\n**C**\n||\n||\n'
const unclosedResult = parse(unclosedTable)
assert(unclosedResult.errors.length >= 1, 'Незакрытая таблица → ошибка')

console.log('\n📦 parse() — cut markers and green')
const cutMd = '{% cut "**Тест**" %}\n# H1\n{green}(1.1. "Тест")\nОбычный текст'
const cutResult = parse(cutMd)
assert(cutResult.converted.length >= 2, 'Есть элементы из cut/md')
const hasCutHeader = cutResult.converted.some(i => i.type === 'header' && i.level === 2)
assert(hasCutHeader, 'Cut marker → HeaderNode level 2')

console.log(`\n${'='.repeat(50)}`)
console.log(`Результат: ${passed} passed, ${failed} failed`)
if (failures.length > 0) {
  console.log('\nНепройденные тесты:')
  failures.forEach(f => console.log(`  ❌ ${f}`))
}
