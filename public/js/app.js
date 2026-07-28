import { parse } from './Parser.js';
import { groupTables } from './PostProcessor.js';
import { compile } from './Compiler.js';
import { render } from './Renderer.js';
let compiledResult = null;
const fileInput = document.getElementById('file-input');
const searchInput = document.getElementById('search-input');
const btnJson = document.getElementById('btn-export-json');
const btnTheme = document.getElementById('btn-theme');
const statusBar = document.getElementById('status-bar');
const tableContainer = document.getElementById('table-container');
const unknownContainer = document.getElementById('unknown-container');
const errorContainer = document.getElementById('error-container');
const THEME_STORAGE_KEY = 'tbl-theme';
function getSavedTheme() {
    return localStorage.getItem(THEME_STORAGE_KEY) || 'dark';
}
function applyTheme(theme) {
    document.body.setAttribute('data-theme', theme);
    btnTheme.innerHTML = theme === 'dark' ? '🌙 Тема' : '☀️ Тема';
    btnTheme.title = 'Переключить тему (сейчас: ' + (theme === 'dark' ? 'тёмная' : 'светлая') + ')';
    localStorage.setItem(THEME_STORAGE_KEY, theme);
}
function toggleTheme() {
    const current = getSavedTheme();
    applyTheme(current === 'dark' ? 'light' : 'dark');
}
applyTheme(getSavedTheme());
btnTheme.addEventListener('click', toggleTheme);
function syncScrollAreas() {
    const wrappers = document.querySelectorAll('.summary-table-wrapper');
    for (const wrapper of wrappers) {
        const scrollArea = wrapper.querySelector('.table-scroll-area');
        const shim = wrapper.querySelector('.sticky-scroll-shim');
        const shimInner = shim.querySelector('.inner');
        if (!scrollArea || !shimInner)
            continue;
        shimInner.style.width = scrollArea.scrollWidth + 'px';
        shim.addEventListener('scroll', () => {
            scrollArea.scrollLeft = shim.scrollLeft;
        });
        scrollArea.addEventListener('scroll', () => {
            shim.scrollLeft = scrollArea.scrollLeft;
        });
    }
}
fileInput.addEventListener('change', async (ev) => {
    const target = ev.target;
    const file = target?.files?.[0];
    if (!file)
        return;
    statusBar.textContent = `Загрузка: ${file.name}…`;
    try {
        const text = await file.text();
        statusBar.textContent = `Парсинг: ${file.name}…`;
        const parsed = parse(text);
        statusBar.textContent = `Группировка: ${file.name}…`;
        const grouped = groupTables(parsed);
        statusBar.textContent = `Компиляция: ${file.name}…`;
        compiledResult = compile(grouped);
        render(compiledResult, tableContainer, unknownContainer, errorContainer);
        syncScrollAreas();
        buildSearchIndex();
        enableControls();
        const totalRows = compiledResult.groups.reduce((sum, g) => sum + g.type1Rows.length + g.type2Rows.length, 0);
        statusBar.textContent = `Готово: ${compiledResult.groups.length} групп, ${totalRows} строк, ${compiledResult.errors.length} ошибок`;
    }
    catch (err) {
        statusBar.textContent = `Ошибка: ${err instanceof Error ? err.message : String(err)}`;
        errorContainer.innerHTML = `<div class="error-list">❌ ${escapeHtml(err instanceof Error ? err.message : String(err))}</div>`;
    }
});
function rowMatches(row, query) {
    return row.textContent?.toLowerCase().includes(query) ?? false;
}
searchInput.addEventListener('input', () => {
    const query = searchInput.value.trim().toLowerCase();
    const allTbodies = tableContainer.querySelectorAll('.data-tbody');
    for (const tbody of allTbodies) {
        const rows = Array.from(tbody.querySelectorAll('tr'));
        if (!query) {
            for (const row of rows)
                row.classList.remove('hidden');
            continue;
        }
        const chunks = [];
        let chunk = [];
        for (const row of rows) {
            chunk.push(row);
            if (!row.classList.contains('section-row') && !row.classList.contains('text-row')) {
                chunks.push(chunk);
                chunk = [];
            }
        }
        if (chunk.length > 0)
            chunks.push(chunk);
        for (const c of chunks) {
            if (c.length === 0)
                continue;
            const dataRow = c[c.length - 1];
            const contextRows = c.slice(0, -1);
            let textMatchIdx = -1;
            for (let i = 0; i < contextRows.length; i++) {
                if (rowMatches(contextRows[i], query)) {
                    textMatchIdx = i;
                    break;
                }
            }
            const dataMatch = rowMatches(dataRow, query);
            if (textMatchIdx >= 0) {
                for (let i = 0; i < contextRows.length; i++) {
                    contextRows[i].classList.toggle('hidden', i < textMatchIdx);
                }
                dataRow.classList.remove('hidden');
            }
            else if (dataMatch) {
                for (const row of contextRows) {
                    row.classList.remove('hidden');
                }
                dataRow.classList.remove('hidden');
            }
            else {
                for (const row of c)
                    row.classList.add('hidden');
            }
        }
    }
});
btnJson.addEventListener('click', () => {
    if (!compiledResult)
        return;
    const json = toJSON(compiledResult);
    downloadFile(json, 'tbl_export.json', 'application/json');
});
function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function enableControls() {
    searchInput.disabled = false;
    btnJson.disabled = false;
    btnTheme.disabled = false;
}
function buildSearchIndex() {
}
function toJSON(compiled) {
    const output = compiled.groups.map(g => ({
        groupIndex: g.groupIndex,
        columns: g.columns,
        type1Rows: g.type1Rows,
        type2Rows: g.type2Rows,
    }));
    return JSON.stringify(output, null, 2);
}
function downloadFile(content, filename, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
//# sourceMappingURL=app.js.map