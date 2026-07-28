# План реализации: Парсер лог-ТЗ → Сводная таблица (SPA) — v2

> Проект: TypeScript SPA, парсящая Markdown-файл ТЗ по логированию и выдающая сводную HTML-таблицу с поиском и экспортом (JSON).
> ТЗ: `tz.md` (актуальное ТЗ v2). Примеры входных данных: `examples/log_tz_short.md`, `examples/log_tz.md`, `examples/log_more_short_example3.md`.
> Код: `src/ts/*`, стили: `public/css/main.css`, точка входа: `public/index.html`.
> Запуск: `npx serve public -l 3000` → `http://localhost:3000`.

---

## Текущий стейт (итог 5-й итерации — visible header/text distinction + escaped dot cleanup)

| Компонент | Статус | Файлы | Комментарии |
|-----------|--------|-------|-------------|
| HTML-скелет | ✅ Готово | `public/index.html` | Без изменений |
| Стили | ✅ Готово | `public/css/main.css` | Пер-уровневая стилизация header (h1-h6), text-row, badges, left border accents |
| Типы данных | ✅ Готово | `src/ts/types.ts` | `OutputRow` (discriminated union: data/text/header) |
| Парсер | ✅ Готово | `src/ts/Parser.ts` | cleanup `**`, `{green}`, `{% cut %}`→H2, `\.`→`.` в cleanText. 75/96 тестов |
| PostProcessor | ✅ Готово | `src/ts/PostProcessor.ts` | Stack-based grouping + per-table items. 27/27 тестов |
| Компилятор | ✅ Готово | `src/ts/Compiler.ts` | Per-group merge + `outputRows` build |
| Рендерер | ✅ Готово | `src/ts/Renderer.ts` | CSS-классы: `section-row h1-h6` для заголовков, `text-row` для текста |
| Поиск/экспорт | ✅ Готово | `src/ts/app.ts` | Pipeline: parse→group→compile→render, DOM-based search |
| Сборка / запуск | ✅ Готово | `package.json`, `tsconfig.json` | `"type": "module"` |
| Тесты Parser | ⚠️ 75/96 | `test/Parser.test.js` | 21 старый сбой (не мои изменения) |
| Тесты PostProcessor | ✅ 27/27 | `test/PostProcessor.test.js` | Все прошли |

---

## ШАГ 1. HTML-скелет и стили

**Статус:** ✅ Готово (итерация 1 → v2: итерация 5)

### `public/index.html`
- `<header id="toolbar">`: поле поиска + кнопка экспорта JSON + статус-бар
- `<main>`: контейнеры `#table-container`, `#unknown-container`, `#error-container`
- `<script type="module" src="js/app.js">`

### `public/css/main.css` — полная спецификация стилей:

**Сводная таблица:**
- `.summary-table`: границы, padding, sticky header, hover, `border-collapse: collapse`
- `.summary-table th`: фон #e9ecef, padding 4-6px, `font-size: 12px`, `white-space: nowrap`
- `.summary-table td`: padding 3-6px, `max-width: 250px`, `word-wrap: break-word`
- Hover и alternate row colors

**Группы:**
- `.group-section`: margin-bottom 24px, padding-bottom 16px, border-bottom
- `.group-title`: font-size 15px, font-weight 700, color #0d6efd, border-bottom
- `.type2-block`: margin-top 10px, padding 8px, background #f8f9fa, border
- `.type2-title`: font-size 14px, font-weight 600, color #6c757d

**Заголовки секций (H1-H6) — `section-row` класс:**
| Класс | Размер | Фон | Левый бордюр |
|-------|--------|-----|-------------|
| `.section-row.h1 td` | 18px | #e7f1ff | #0d6efd (3px) |
| `.section-row.h2 td` | 16px | #edf2ff | #0b5ed7 (3px) |
| `.section-row.h3 td` | 15px | #f0f4ff | #0a58ca (3px) |
| `.section-row.h4 td` | 14px | #f3f6ff | #095cb4 (3px) |
| `.section-row.h5 td` | 13px | #f5f7ff | #0860c2 (3px) |
| `.section-row.h6 td` | 12px | #f7f8ff | #075db0 (3px), font-weight 500 |

Все: `font-weight: 600`, `color: #0d6efd`, `padding: 4px 10px`, **без padding-left**

**Текстовые строки — `text-row` класс:**
- Фон: #fffbe6, цвет: #664d03, font-style: italic
- Левый бордюр: 3px solid #e6a817
- font-size: 12px, font-weight: 400, padding: 4px 10px

**Бейджи О/НО:**
- `.badge-ok`: #d1e7dd фон, #0f5132 текст
- `.badge-no`: #fff3cd фон, #664d03 текст

**Unknown tables:** `<details>`/`<summary>`, фон #fff5f5, border #dee2e6

---

## ШАГ 2. Типы данных (TypeScript interfaces)

**Статус:** ✅ Готово

### `src/ts/types.ts`:

**Parser:**
```typescript
interface ParsedResult { converted: ParsedItem[]; errors: string[] }
type ParsedItem = HeaderNode | TableNode | TextNode
interface HeaderNode { type: 'header'; level: number; content: string }
interface TableNode { type: 'table'; tableType: 'type-1' | 'type-2' | 'unknown'; colCnt: number; headers?: string[]; rows: string[][] }
interface TextNode { type: 'text'; content: string }
```

**PostProcessor:**
```typescript
interface GroupedResult { groups: TableGroup[]; remainingUnknowns: UnknownTable[]; errors: string[] }
interface TableWithContent { table: TableNode; items: (HeaderNode | TextNode)[] }
interface TableGroup { groupIndex: number; type1Items: TableNode[]; type2Item?: TableNode; headers: HeaderNode[]; texts: TextNode[]; tables: TableWithContent[] }
```

**Compiler:**
```typescript
interface CompiledResult { groups: CompiledGroup[]; unknownTables: UnknownTable[]; errors: string[] }
type OutputRow = { kind: 'data'; dataRow: CompiledRow } | { kind: 'text'; content: string } | { kind: 'header'; level: number; content: string }
interface CompiledGroup { groupIndex: number; columns: ColumnDef[]; type1Rows: CompiledRow[]; type2Rows: CompiledRow[]; type2Columns: ColumnDef[]; type2Item?: TableNode; outputRows: OutputRow[] }
type CompiledRow = Record<string, string>
interface ColumnDef { key: string; label: string; description: string }
interface SectionHeader { level: number; content: string }
interface UnknownTable { markdown: string; cells: string[][] }
```

**Renderer:**
```typescript
type HighlightType = 'ok' | 'no' | 'text'
interface RenderContext { compiled: CompiledResult; container: HTMLElement; unknownContainer: HTMLElement; errorContainer: HTMLElement }
```

---

## ШАГ 3. Парсер (Parser)

**Статус:** ✅ Готово (итерация 3 → v2: итерация 5, добавлен `\.`→`.` cleanup)

### `src/ts/Parser.ts`:
- `sanitize(value)` — убирает `**`, `&nbsp;`, escape-последовательности (`\[`, `]`, `\{`, `\}`, `\|`, `\n`, `\t`), все оставшиеся `\`, squeeze spaces, trim
- `classifyNonTableCell(line)` — header, `{% cut %}`→H2, text. **Итерация 5:** применяет `cleanText()` к контенту header и text
- `extractCells(lines, start, end)` — разбиение по `|`, `||` разделители строк
- `classifyTable(headers, rows)` — type-1 / type-2 (О/НО) / unknown
- `parse(mdText)` — state machine: text mode ↔ table mode
- `cleanText(content)` — `{green}(...)` → `(...)`, убирает `**`, **итерация 5:** `\.` → `.`
- `extractCutContent(line)` — `{% cut "..." %}` → текст для HeaderNode(level: 2)

---

## ШАГ 4. PostProcessor (группировка)

**Статус:** ✅ Готово (итерация 3)

### `src/ts/PostProcessor.ts`:
- `groupTables(parsed: ParsedResult): GroupedResult`
  - Stack-based grouping: type-1 пушится на pendingStack, type-2 закрывает группу
  - unknown → boundary: flush pending → новая группа
  - header/text → добавляются в currentGroup.headers/texts или буферятся
  - End-of-file flush: pendingStack → orphan group
  - Итерация 4: убран `currentGroup = null` из case `type-2` (фикс потери header/text между группами)

### Результат:
`GroupedResult { groups: TableGroup[], remainingUnknowns: UnknownTable[], errors: string[] }`

---

## ШАГ 5. Компилятор (Compiler)

**Статус:** ✅ Готово (итерация 3 → v2: split columns + merge)

### `src/ts/Compiler.ts`:
- `compile(grouped: GroupedResult): CompiledResult` — per-group compilation
- `buildGroupColumns(group)` — columns из type-1 (Поле/Описание) + action-колонки из type-2 row 0
- Merge О/НО: для каждой type-1 строки находим action в type-2 row 0, заполняем type-1 поля из type-2 data rows
- `buildGroupRows(group)` — type1Rows (с merged) + type2Rows (compact matrix)
- Функции: `normalize()`, `findColIdx()`, `findColKey()`, `getHeaderIndices()`

### Результат:
```typescript
CompiledResult {
  groups: CompiledGroup[]
  unknownTables: UnknownTable[]
  errors: string[]

CompiledGroup {
  groupIndex: number
  columns: ColumnDef[]
  type1Rows: CompiledRow[]
  type2Rows: CompiledRow[]
  type2Columns: ColumnDef[]
  type2Item?: TableNode
  outputRows: OutputRow[]  // итерация 4: text/header + data interleaved
}
```

---

## ШАГ 6. Рендерер (Renderer)

**Статус:** ✅ Готово (итерация 3 → v2: пер-групп rendering + text/header classes)

### `src/ts/Renderer.ts`:
- `render(compiled, container, unknownContainer, errorContainer)` — per-group rendering
- `renderGroup(group)` — групповой wrapper + type-1 table + type-2 compact table
- `highlightO_NO(value)` — О → `.badge-ok`, НО → `.badge-no`
- `escapeHtml(s)` — HTML-экранирование
- `renderHtmlTable(cells)` — for unknown tables

**Итерация 3 фикс:** type-2 table рендерит **только свои** колонки (row 0 action-имена + column1_value), без type-1 полей, значения как есть (без badge).

**Итерация 4:** text/header строки рендерятся в `<tbody>` перед data-строками (через `outputRows`).

**Итерация 5 (текущая):** прокинуты CSS-классы:
- `{ kind: 'header', level: N, content: ... }` → `<tr class="section-row hN">`
- `{ kind: 'text', content: ... }` → `<tr class="text-row">`

---

## ШАГ 7. Точка входа (app.ts)

**Статус:** ✅ Готово

### Pipeline:
```
fileInput → parse() → groupTables() → compile() → render()
```

### Реализация:
- `import { groupTables } from './PostProcessor.js'` ✅
- Обработчик fileInput: parse → groupTables → compile → render ✅
- Экспорт JSON: `toJSON(compiled)` — массив groups ✅
- Поиск: DOM-based фильтрация `.data-tbody` строк ✅ (работает для data + text/header строк)
- Status bar: `N групп, M строк, E ошибок` ✅

---

## ШАГ 8. Тесты

**Статус:** ⚠️ Parser 75/96, PostProcessor 27/27

### `test/Parser.test.js` — 75 passed, 21 failed (pre-existing):
- `sanitize()`: ✅ **, trim, &nbsp;, escape скобки, spaces
- `cleanText()`: ✅ **, текст. ❌ `{green}(...)` (pre-existing bug)
- `extractCutContent()`: ✅ cut с кавычками, не cut → null
- `classifyNonTableCell()`: ✅ H1–H6, {% cut %} → H2, text
- `extractCells()`: ✅ 1 строка, первая ячейка, 2 строки. ❌ 3 ячейки, Строка 1/2 (pre-existing bug)
- `classifyTable()`: ✅ type-1, type-2, unknown, регистронезависимо
- `parse() — full file`: ✅ 41 element, 20 headers, 18 tables, 3 text blocks. ❌ Table cols=3 (×18 — pre-existing)
- `parse() — edge cases`: ✅ пустой файл, только заголовки, только таблица, незакрытая таблица
- `parse() — cut+green`: ✅ cut marker, green inline

### `test/PostProcessor.test.js` — 27 passed, 0 failed:
- type-1 → type-2 (one-to-one)
- multiple type-1 → one type-2
- type-1 без type-2 (конец файла)
- unknown таблицы → remainingUnknowns
- text nodes внутри группы
- несколько независимых групп
- пустой файл

---

## ШАГ 9. Примеры

**Статус:** ⚠️ UI-тест через загрузку файла в браузер

### `examples/`:
- `log_tz_short.md` — короткий пример
- `log_tz.md` — полный пример
- `log_more_short_example3.md` — пример с `\.` в заголовках (итерация 5)

---

## ШАГ 10. Сборка и запуск

**Статус:** ✅ Готово

- `npm run build` → `tsc` (outDir: `public/js/`)
- `npm run dev` → `npx serve public -l 3000`
- `package.json`: `"type": "module"`

---

## Текущий статус реализации

| № | Задача | Статус | Тесты |
|---|--------|--------|-------|
| 1 | `types.ts` — все интерфейсы | ✅ Готово | — |
| 2 | `Parser.ts` — cleanup (`**`, `{green}`, `{% cut %}`, `\.`→`. `) | ✅ Готово | 75/96 |
| 3 | `PostProcessor.ts` — stack-based grouping | ✅ Готово | 27/27 |
| 4 | `Compiler.ts` — per-group merge + outputRows | ✅ Готово | — |
| 5 | `Renderer.ts` — per-group rendering + CSS classes | ✅ Готово | — |
| 6 | `app.ts` — pipeline + search + export | ✅ Готово | — |
| 7 | `test/Parser.test.js` | ⚠️ 75/96 | 21 pre-existing |
| 8 | `test/PostProcessor.test.js` | ✅ 27/27 | — |
| 9 | `public/css/main.css` — full styling spec | ✅ Готово | — |
| 10 | UI-тест на примерах | ⚠️ TODO | — |

---

## Структура файлов

```
W:\agentDev\TBL\
├── examples/
│   ├── log_tz.md                  # Полный пример
│   ├── log_tz_short.md            # Короткий пример
│   └── log_more_short_example3.md # Пример с \\.(escaped dot)
├── public/
│   ├── index.html                 # HTML-скелет
│   ├── css/
│   │   └── main.css               # Полная спецификация стилей (см. ШАГ 1)
│   └── js/                        # Скомпилированные .js файлы (outDir)
│       ├── app.js
│       ├── Parser.js
│       ├── PostProcessor.js
│       ├── Compiler.js
│       ├── Renderer.js
│       └── types.js
├── src/
│   └── ts/
│       ├── types.ts               # Все интерфейсы
│       ├── Parser.ts              # Cleanup + parse
│       ├── PostProcessor.ts       # Stack-based grouping
│       ├── Compiler.ts            # Per-group merge + outputRows
│       ├── Renderer.ts            # Per-group rendering + CSS classes
│       └── app.ts                 # Pipeline: parse→group→compile→render
├── test/
│   ├── Parser.test.js             # 75/96 (21 pre-existing failures)
│   └── PostProcessor.test.js      # 27/27
├── package.json                   # "type": "module"
├── tsconfig.json
├── tz.md                          # Актуальное ТЗ (v2)
└── plan.md                        # Этот файл
```

---

## Ключевые изменения по сравнению с v1

| Аспект | v1 | v2 |
|--------|-----|-----|
| Merge | Global (все type-1 с все type-2) | Per-group (type-1 с ближайшим type-2) |
| Columns | Global (одни для всех) | Per-group (свои для каждой группы) |
| Grouping | Нет | Stack-based через PostProcessor |
| TextNode cleanup | Только sanitize() для ячеек | + `**`, `{green}`, `{% cut %}`→H2, **`\.`→`.`** |
| Output | Одна сводная таблица | Группы → таблица + компактная type-2 таблица |
| Pipeline | parse → compile → render | parse → group → compile → render |
| Text/Header rendering | colspan tr без классов | **CSS classes: `section-row h1-h6`, `text-row`** |

---

## TODO / Next Steps

### Must-do
1. **UI-тест на примерах:** Загрузить `examples/log_more_short_example3.md` через UI, проверить:
   - `\.` в заголовках заменены на `.`
   - Заголовки и текст вне таблиц рендерятся с CSS-классами
   - Визуальное различие между H1-H6, text rows
2. ~~**Compiler.ts:** Построить `outputRows` из `itemsInOrder`~~ ✅ Итерация 4
3. ~~**Renderer.ts:** Рендерить `outputRows` с CSS-классами~~ ✅ Итерация 5
4. ~~**Parser.ts:** `\.` → `.` в cleanText~~ ✅ Итерация 5
5. ~~**Parser.ts:** cleanText для header content~~ ✅ Итерация 5
6. ~~**CSS:** Пер-уровневая стилизация headers~~ ✅ Итерация 5

### Nice-to-have
7. Показать group title из type-1 (Название = action) вместо "Группа N"
8. Стрелочки/связи между group title и rows
9. Фильтр по группам (checkbox или select)
