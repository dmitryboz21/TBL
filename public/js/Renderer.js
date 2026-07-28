function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
export function highlightO_NO(value) {
    if (value === 'О')
        return `<span class="badge badge-ok">О</span>`;
    if (value === 'НО')
        return `<span class="badge badge-no">НО</span>`;
    return escapeHtml(value);
}
export function render(compiled, container, unknownContainer, errorContainer) {
    const { groups, unknownTables, errors } = compiled;
    container.innerHTML = '';
    unknownContainer.innerHTML = '';
    errorContainer.innerHTML = '';
    for (const group of groups) {
        renderGroup(group, container);
    }
    if (unknownTables.length > 0) {
        let html = `<h2>Необработанные таблицы (${unknownTables.length})</h2>`;
        for (const ut of unknownTables) {
            html += '<details class="unknown-table-item"><summary>';
            html += `Неизвестная таблица (${ut.cells.length} строк)`;
            html += '</summary>';
            html += renderHtmlTable(ut.cells);
            html += '</details>';
        }
        unknownContainer.innerHTML = html;
    }
    if (errors.length > 0) {
        let html = '<div class="error-list"><ul>';
        for (const err of errors) {
            html += `<li>${escapeHtml(err)}</li>`;
        }
        html += '</ul></div>';
        errorContainer.innerHTML = html;
    }
}
function renderGroup(group, container) {
    const { groupIndex, columns, type1Rows, type2Rows, type2Item, outputRows } = group;
    let html = '';
    html += `<div class="group-section" data-group-index="${groupIndex}">`;
    html += `<h2 class="group-title">Группа ${groupIndex + 1}</h2>`;
    html += '<div class="summary-table-wrapper"><div class="table-scroll-area">';
    html += `<table class="summary-table group-table" data-group-index="${groupIndex}">`;
    html += '<thead>';
    html += '<tr>';
    for (const col of columns) {
        html += `<th>${escapeHtml(col.label)}</th>`;
    }
    html += '</tr>';
    html += '<tr class="header-row">';
    for (const col of columns) {
        html += `<th class="col-description">${escapeHtml(col.description)}</th>`;
    }
    html += '</tr>';
    html += '</thead>';
    html += '<tbody class="data-tbody">';
    if (outputRows.length === 0) {
        html += `<tr><td colspan="${columns.length}" class="empty-row">Нет данных</td></tr>`;
    }
    else {
        for (const row of outputRows) {
            switch (row.kind) {
                case 'header': {
                    const cls = `section-row h${row.level}`;
                    html += `<tr class="${cls}"><td colspan="${columns.length}">${escapeHtml(row.content)}</td></tr>`;
                    break;
                }
                case 'text':
                    html += `<tr class="text-row"><td colspan="${columns.length}">${escapeHtml(row.content)}</td></tr>`;
                    break;
                default: {
                    const dataRow = row.dataRow;
                    html += '<tr data-row-type="data">';
                    for (const col of columns) {
                        html += `<td>${highlightO_NO(dataRow[col.key] ?? '')}</td>`;
                    }
                    html += '</tr>';
                    break;
                }
            }
        }
    }
    html += '</tbody>';
    html += '</table></div><div class="sticky-scroll-shim"><div class="inner"></div></div></div>';
    if (type2Item && type2Item.rows.length > 0) {
        const type2Columns = group.type2Columns;
        html += '<div class="type2-block">';
        html += '<h3 class="type2-title">Матрица обязательности</h3>';
        html += '<div class="summary-table-wrapper"><div class="table-scroll-area">';
        html += `<table class="summary-table type2-table" data-group-index="${groupIndex}">`;
        html += '<thead>';
        html += '<tr>';
        for (const col of type2Columns) {
            html += `<th>${escapeHtml(col.label)}</th>`;
        }
        html += '</tr>';
        html += '<tr class="header-row">';
        for (const col of type2Columns) {
            html += `<th class="col-description">${escapeHtml(col.description)}</th>`;
        }
        html += '</tr>';
        html += '</thead>';
        html += '<tbody class="data-tbody">';
        for (const row of type2Rows) {
            html += '<tr>';
            for (const col of type2Columns) {
                html += `<td>${highlightO_NO(row[col.key] ?? '')}</td>`;
            }
            html += '</tr>';
        }
        html += '</tbody>';
        html += '</table></div><div class="sticky-scroll-shim"><div class="inner"></div></div></div>';
        html += '</div>';
    }
    html += '</div>';
    container.insertAdjacentHTML('beforeend', html);
}
function renderHtmlTable(cells) {
    if (cells.length === 0)
        return '<em>пустая таблица</em>';
    const headerRow = cells[0] ?? [];
    let html = '<table class="unknown-table">';
    html += '<thead><tr>';
    for (const cell of headerRow) {
        html += `<th>${escapeHtml(cell)}</th>`;
    }
    html += '</tr></thead>';
    html += '<tbody>';
    for (let i = 1; i < cells.length; i++) {
        html += '<tr>';
        const row = cells[i] ?? [];
        for (const cell of row) {
            html += `<td>${escapeHtml(cell)}</td>`;
        }
        html += '</tr>';
    }
    html += '</tbody></table>';
    return html;
}
//# sourceMappingURL=Renderer.js.map