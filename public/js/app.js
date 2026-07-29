import { parse } from './Parser.js';
import { groupTables } from './PostProcessor.js';
import { compile } from './Compiler.js';
import { render } from './Renderer.js';
import { loadSettings, saveSettings, collectAllColumnKeys, copySettingsFrom, } from './ColumnSettings.js';
let compiledResult = null;
let currentFileName = '';
let currentSettings = { hidden: [], renamed: {} };
let allColumnKeys = [];
let allColumnLabels = {};
let allOriginalColumnKeys = [];
let allOriginalGroupColumns = [];
const fileInput = document.getElementById('file-input');
const searchInput = document.getElementById('search-input');
const btnJson = document.getElementById('btn-export-json');
const btnTheme = document.getElementById('btn-theme');
const btnColSettings = document.getElementById('btn-column-settings');
const statusBar = document.getElementById('status-bar');
const tableContainer = document.getElementById('table-container');
const unknownContainer = document.getElementById('unknown-container');
const errorContainer = document.getElementById('error-container');
const dropdown = document.getElementById('column-settings-dropdown');
const colList = document.getElementById('column-settings-list');
const hiddenBadge = document.getElementById('col-hidden-badge');
const renamedBadge = document.getElementById('col-renamed-badge');
const btnSave = document.getElementById('btn-save-settings');
const btnResetHidden = document.getElementById('btn-reset-hidden');
const btnResetRename = document.getElementById('btn-reset-renamed');
const selectSavedFiles = document.getElementById('select-saved-files');
const btnLoadSettings = document.getElementById('btn-load-settings');
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
function restoreOriginalColumns(compiled) {
    for (const group of compiled.groups) {
        const orig = allOriginalGroupColumns[group.groupIndex];
        if (orig)
            group.columns = orig.slice();
        if (group.type2Columns && group.type2Item) {
            const origType2 = allOriginalGroupColumns[group.groupIndex + 1000] ?? [];
            group.type2Columns = origType2.slice();
        }
    }
}
function restoreOriginalLabels(compiled) {
    for (const group of compiled.groups) {
        for (const col of group.columns) {
            const orig = allColumnLabels[col.key];
            if (orig)
                col.label = orig;
        }
        if (group.type2Columns) {
            for (const col of group.type2Columns) {
                const orig = allColumnLabels[col.key];
                if (orig)
                    col.label = orig;
            }
        }
    }
}
function updateBadges() {
    if (!hiddenBadge || !renamedBadge)
        return;
    const hiddenCount = currentSettings.hidden.length;
    const renamedCount = Object.keys(currentSettings.renamed).length;
    if (hiddenCount > 0) {
        hiddenBadge.textContent = `С${hiddenCount}`;
        hiddenBadge.classList.remove('hidden');
    }
    else {
        hiddenBadge.classList.add('hidden');
    }
    if (renamedCount > 0) {
        renamedBadge.textContent = `П${renamedCount}`;
        renamedBadge.classList.remove('hidden');
    }
    else {
        renamedBadge.classList.add('hidden');
    }
}
function openColumnSettings() {
    if (!dropdown)
        return;
    dropdown.classList.remove('hidden');
    renderColumnList();
    refreshSavedFilesSelect();
}
function closeColumnSettings() {
    if (!dropdown)
        return;
    dropdown.classList.add('hidden');
}
function renderColumnList() {
    if (!colList)
        return;
    colList.innerHTML = '';
    for (const key of allOriginalColumnKeys) {
        const originalLabel = allColumnLabels[key] ?? key;
        const item = document.createElement('div');
        item.className = 'column-settings-item';
        const nameSpan = document.createElement('span');
        nameSpan.className = 'col-name';
        nameSpan.title = originalLabel;
        nameSpan.textContent = originalLabel;
        nameSpan.style.color = currentSettings.hidden.includes(key)
            ? 'var(--text-muted)'
            : 'var(--text-primary)';
        if (currentSettings.renamed[key]) {
            nameSpan.textContent = `${originalLabel} → ${currentSettings.renamed[key]}`;
        }
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.title = 'Скрыть столбец во всех группах';
        checkbox.dataset.key = key;
        checkbox.checked = currentSettings.hidden.includes(key);
        const renameInput = document.createElement('input');
        renameInput.type = 'text';
        renameInput.className = 'col-rename-input';
        renameInput.placeholder = 'Переименовать…';
        renameInput.title = 'Новое имя столбца при выводе и экспорте';
        renameInput.dataset.key = key;
        renameInput.value = currentSettings.renamed[key] ?? '';
        item.appendChild(nameSpan);
        item.appendChild(checkbox);
        item.appendChild(renameInput);
        colList.appendChild(item);
    }
}
function applyFromList() {
    if (!colList || !compiledResult)
        return;
    const hidden = [];
    const renamed = {};
    for (const key of allOriginalColumnKeys) {
        const item = colList.querySelector(`input[type="checkbox"][data-key="${key}"]`)?.closest('.column-settings-item');
        if (!item)
            continue;
        const checkbox = item.querySelector('input[type="checkbox"]');
        const renameInput = item.querySelector('input.col-rename-input');
        if (checkbox?.checked) {
            hidden.push(key);
        }
        const newLabel = renameInput?.value.trim();
        if (newLabel) {
            renamed[key] = newLabel;
        }
    }
    currentSettings = { hidden, renamed };
    updateBadges();
}
btnSave?.addEventListener('click', () => {
    if (!compiledResult || !currentFileName)
        return;
    applyFromList();
    saveSettings(currentFileName, currentSettings);
    restoreOriginalColumns(compiledResult);
    restoreOriginalLabels(compiledResult);
    render(compiledResult, tableContainer, unknownContainer, errorContainer, currentSettings);
    syncScrollAreas();
    closeColumnSettings();
});
document.addEventListener('resize', () => {
    syncScrollAreas();
});
btnResetHidden?.addEventListener('click', () => {
    currentSettings.hidden = [];
    if (colList) {
        for (const item of colList.querySelectorAll('input[type="checkbox"]')) {
            item.checked = false;
        }
    }
    updateBadges();
});
btnResetRename?.addEventListener('click', () => {
    currentSettings.renamed = {};
    if (colList) {
        for (const item of colList.querySelectorAll('input.col-rename-input')) {
            item.value = '';
        }
    }
    updateBadges();
});
function collectSavedFileNames(exclude) {
    const seen = new Set();
    const result = [];
    const hiddenSuffix = '__hidden_columns';
    const renamedSuffix = '__renamed_columns';
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key)
            continue;
        const idxH = key.indexOf(hiddenSuffix);
        const idxR = key.indexOf(renamedSuffix);
        if (idxH >= 0 || idxR >= 0) {
            const basename = idxH >= 0 ? key.substring(0, idxH) : key.substring(0, idxR);
            if (basename === exclude)
                continue;
            if (!seen.has(basename)) {
                seen.add(basename);
                result.push(basename);
            }
        }
    }
    return result.sort();
}
function refreshSavedFilesSelect() {
    if (!selectSavedFiles)
        return;
    const currentVal = selectSavedFiles.value;
    selectSavedFiles.innerHTML = '<option value="">— сохранённые настройки —</option>';
    for (const name of collectSavedFileNames(currentFileName)) {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        selectSavedFiles.appendChild(opt);
    }
    if (currentVal && [...selectSavedFiles.options].some(o => o.value === currentVal)) {
        selectSavedFiles.value = currentVal;
    }
    if (btnLoadSettings)
        btnLoadSettings.disabled = !selectSavedFiles.value;
}
btnLoadSettings?.addEventListener('click', () => {
    const sourceBasename = selectSavedFiles?.value;
    if (!sourceBasename || !compiledResult)
        return;
    const copied = copySettingsFrom(sourceBasename, compiledResult, currentSettings, allColumnKeys);
    currentSettings = copied;
    updateBadges();
    saveSettings(currentFileName, currentSettings);
    restoreOriginalColumns(compiledResult);
    restoreOriginalLabels(compiledResult);
    render(compiledResult, tableContainer, unknownContainer, errorContainer, currentSettings);
    syncScrollAreas();
    closeColumnSettings();
});
selectSavedFiles?.addEventListener('change', () => {
    if (btnLoadSettings)
        btnLoadSettings.disabled = !selectSavedFiles.value;
});
btnColSettings?.addEventListener('click', (ev) => {
    ev.stopPropagation();
    if (dropdown?.classList.contains('hidden')) {
        openColumnSettings();
    }
    else {
        closeColumnSettings();
    }
});
document.addEventListener('click', (ev) => {
    if (dropdown && !dropdown.contains(ev.target) && !btnColSettings?.contains(ev.target)) {
        closeColumnSettings();
    }
});
fileInput.addEventListener('change', async (ev) => {
    const target = ev.target;
    const file = target?.files?.[0];
    if (!file)
        return;
    statusBar.textContent = `Загрузка: ${file.name}…`;
    currentFileName = file.name.replace(/\.(md|markdown)$/i, '');
    try {
        const text = await file.text();
        statusBar.textContent = `Парсинг: ${file.name}…`;
        const parsed = parse(text);
        statusBar.textContent = `Группировка: ${file.name}…`;
        const grouped = groupTables(parsed);
        statusBar.textContent = `Компиляция: ${file.name}…`;
        compiledResult = compile(grouped);
        allColumnKeys = [];
        allColumnLabels = {};
        allOriginalColumnKeys = [];
        if (compiledResult) {
            for (const group of compiledResult.groups) {
                for (const col of group.columns) {
                    if (!allColumnLabels[col.key]) {
                        allColumnKeys.push(col.key);
                        allColumnLabels[col.key] = col.label;
                    }
                }
                if (group.type2Columns) {
                    for (const col of group.type2Columns) {
                        if (!allColumnLabels[col.key]) {
                            allColumnKeys.push(col.key);
                            allColumnLabels[col.key] = col.label;
                        }
                    }
                }
            }
        }
        allOriginalColumnKeys = [];
        allOriginalGroupColumns = [];
        if (compiledResult) {
            for (const group of compiledResult.groups) {
                for (const col of group.columns) {
                    if (!allOriginalColumnKeys.includes(col.key))
                        allOriginalColumnKeys.push(col.key);
                }
                allOriginalGroupColumns[group.groupIndex] = group.columns.slice();
                if (group.type2Columns) {
                    for (const col of group.type2Columns) {
                        if (!allOriginalColumnKeys.includes(col.key))
                            allOriginalColumnKeys.push(col.key);
                    }
                    allOriginalGroupColumns[group.groupIndex + 1000] = group.type2Columns.slice();
                }
            }
        }
        currentSettings = loadSettings(currentFileName);
        restoreOriginalColumns(compiledResult);
        restoreOriginalLabels(compiledResult);
        render(compiledResult, tableContainer, unknownContainer, errorContainer, currentSettings);
        syncScrollAreas();
        buildSearchIndex();
        enableControls();
        updateBadges();
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
    btnColSettings.disabled = false;
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