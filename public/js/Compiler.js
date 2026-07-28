function normalize(s) {
    return s.replace(/\s+/g, ' ').trim().toLowerCase();
}
function remapFieldName(field) {
    if (normalize(field) === 'список всех экранов записи лога')
        return 'page type';
    return field;
}
function findColIdx(columns, key) {
    const n = normalize(key);
    return columns.findIndex(c => normalize(c.key) === n);
}
function findColKey(columns, key) {
    const idx = findColIdx(columns, key);
    return idx >= 0 ? columns[idx].key : null;
}
function getHeaderIndices(table) {
    const headers = table.headers ?? [];
    let field = -1, desc = -1, value = -1;
    for (let i = 0; i < headers.length; i++) {
        const h = headers[i];
        if (!h)
            continue;
        const n = normalize(h);
        if (n === 'поле')
            field = i;
        else if (n === 'описание')
            desc = i;
        else if (n === 'значение')
            value = i;
    }
    return { field, desc, value };
}
export function compile(grouped) {
    const errors = [...grouped.errors];
    const groups = [];
    for (const group of grouped.groups) {
        const compiled = compileGroup(group, errors);
        groups.push(compiled);
    }
    const unknownTables = grouped.remainingUnknowns;
    return { groups, unknownTables, errors };
}
function compileGroup(group, errors) {
    const { type1Items, type2Item } = group;
    const columns = [];
    const seenFields = new Set();
    for (const table of type1Items) {
        const { field: fIdx, desc: dIdx } = getHeaderIndices(table);
        if (fIdx < 0 || dIdx < 0)
            continue;
        for (const row of table.rows) {
            if (row.length <= Math.max(fIdx, dIdx))
                continue;
            const field = row[fIdx];
            const desc = row[dIdx];
            if (!field)
                continue;
            const canonField = remapFieldName(field);
            if (seenFields.has(canonField))
                continue;
            seenFields.add(canonField);
            const colDef = desc
                ? { key: canonField, label: canonField, description: desc }
                : { key: canonField, label: canonField, description: '' };
            columns.push(colDef);
        }
    }
    const nameToRowIdx = new Map();
    const type1Rows = [];
    for (const table of type1Items) {
        const { field: fIdx, value: vIdx } = getHeaderIndices(table);
        if (fIdx < 0 || vIdx < 0)
            continue;
        const row = {};
        for (const col of columns)
            row[col.key] = '';
        let nameValue = '';
        for (const dataRow of table.rows) {
            if (dataRow.length <= Math.max(fIdx, vIdx))
                continue;
            const field = dataRow[fIdx];
            const value = dataRow[vIdx];
            if (!field || !value)
                continue;
            if (normalize(field) === 'название')
                nameValue = value;
            const colKey = findColKey(columns, remapFieldName(field));
            if (colKey)
                row[colKey] = value;
        }
        const idx = type1Rows.length;
        type1Rows.push(row);
        if (nameValue)
            nameToRowIdx.set(nameValue, idx);
    }
    let type2Rows = [];
    const type1ExtraColumns = [];
    const type2ExtraColumns = [];
    if (type2Item) {
        const type2HeaderRow = type2Item.headers ?? [];
        const dataRows = type2Item.rows;
        type1ExtraColumns.length = 0;
        const seenFieldNames = new Set();
        const SKIP_FIELDS = new Set(['Описание события']);
        for (const dataRow of dataRows) {
            if (dataRow.length < 2)
                continue;
            const fieldName = dataRow[0] ?? '';
            if (!fieldName || seenFieldNames.has(fieldName))
                continue;
            seenFieldNames.add(fieldName);
            if (SKIP_FIELDS.has(fieldName))
                continue;
            if (findColIdx(columns, fieldName) >= 0)
                continue;
            type1ExtraColumns.push({ key: fieldName, label: fieldName, description: '' });
        }
        for (const col of type1ExtraColumns) {
            if (findColIdx(columns, col.key) < 0) {
                columns.push(col);
            }
        }
        for (const row of type1Rows) {
            for (const col of type1ExtraColumns) {
                if (!(col.key in row))
                    row[col.key] = '';
            }
        }
        type2ExtraColumns.length = 0;
        for (let j = 1; j < type2HeaderRow.length; j++) {
            const colName = type2HeaderRow[j] ?? '';
            if (!colName || colName === '&nbsp;')
                continue;
            type2ExtraColumns.push({ key: colName, label: colName, description: '' });
        }
        for (const row of type1Rows) {
            for (const col of type2ExtraColumns) {
                if (!(col.key in row))
                    row[col.key] = '';
            }
        }
        const type2Actions = new Set();
        for (let j = 1; j < type2HeaderRow.length; j++) {
            const a = type2HeaderRow[j]?.trim();
            if (a && a !== '&nbsp;')
                type2Actions.add(normalize(a));
        }
        const type2ActionsUsed = new Set();
        for (let i = 0; i < type1Rows.length; i++) {
            const t1Row = type1Rows[i];
            const nameKey = findColKey(columns, 'Название');
            if (!nameKey)
                continue;
            const actionVal = t1Row[nameKey] ?? '';
            const normalizedAction = normalize(actionVal);
            let actionColIdx = -1;
            for (let j = 1; j < type2HeaderRow.length; j++) {
                if (normalize(type2HeaderRow[j] ?? '') === normalizedAction) {
                    actionColIdx = j;
                    break;
                }
            }
            if (actionColIdx < 0) {
                errors.push(`Action "${actionVal}" из type-1 (группа ${group.groupIndex}) не найден в type-2`);
                continue;
            }
            type2ActionsUsed.add(normalizedAction);
            for (const col of type1ExtraColumns) {
                for (const dataRow of dataRows) {
                    if (dataRow[0] === col.key) {
                        const value = dataRow[actionColIdx] ?? '';
                        if (value !== 'О' && value !== 'НО') {
                            errors.push(`Не-О/НО значение "${value}" в type-2 (строка "${col.key}", ` +
                                `action "${actionVal}", группа ${group.groupIndex})`);
                        }
                        if (!(col.key in t1Row) || t1Row[col.key] === '')
                            t1Row[col.key] = value;
                        break;
                    }
                }
            }
        }
        for (const action of type2Actions) {
            if (!type2ActionsUsed.has(action)) {
                const colName = type2ExtraColumns.find(c => normalize(c.key) === action)?.key;
                if (colName) {
                    errors.push(`Action "${colName}" из type-2 row 0 не найден в type-1 (группа ${group.groupIndex})`);
                }
            }
        }
        type2Rows = [];
        for (const dataRow of dataRows) {
            if (dataRow.length < 2)
                continue;
            const t2Row = {};
            for (const col of type2ExtraColumns)
                t2Row[col.key] = '';
            t2Row['column1_value'] = dataRow[0] ?? '';
            for (let j = 0; j < type2ExtraColumns.length && (j + 1) < dataRow.length; j++) {
                t2Row[type2ExtraColumns[j].key] = dataRow[j + 1] ?? '';
            }
            type2Rows.push(t2Row);
        }
    }
    const outputRows = [];
    let tableIdx = 0;
    for (const tableContent of group.tables) {
        for (const item of tableContent.items) {
            if (item.type === 'header') {
                outputRows.push({ kind: 'header', level: item.level, content: item.content });
            }
            else {
                outputRows.push({ kind: 'text', content: item.content });
            }
        }
        if (tableIdx < type1Rows.length) {
            outputRows.push({ kind: 'data', dataRow: type1Rows[tableIdx] });
        }
        tableIdx++;
    }
    const result = {
        groupIndex: group.groupIndex,
        columns,
        type1Rows,
        type2Rows,
        type2Columns: type2Item ? [{ key: 'column1_value', label: 'column1_value', description: '' }, ...type2ExtraColumns] : [],
        outputRows,
    };
    if (type2Item)
        result.type2Item = type2Item;
    return result;
}
//# sourceMappingURL=Compiler.js.map