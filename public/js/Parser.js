export function sanitize(value) {
    return cleanText(value
        .replaceAll(/page\stype:\s/g, '')
        .replaceAll(/\*/g, '')
        .replaceAll(/&nbsp;/g, ' ')
        .replaceAll(/\\\[/g, '[')
        .replaceAll(/\\\]/g, ']')
        .replaceAll(/\\\{/g, '{')
        .replaceAll(/\\\}/g, '}')
        .replaceAll(/\\\|/g, '|')
        .replaceAll(/\\n/g, '')
        .replaceAll(/\\t/g, ' ')
        .replaceAll(/\\/g, '')
        .replaceAll(/\r\n/g, '\n')
        .replaceAll(/\s+/g, ' ')).trim();
}
export function cleanText(content) {
    let result = content.trim();
    result = result.replace(/\\\./g, '.');
    result = result.replace(/\*\*/g, '');
    result = result.replace(/\{(gray|yellow|orange|red|green|blue|violet)\}\(([^)]*)\)/g, '$2');
    result = result.replaceAll('{% endcut %}', '');
    result = result.replaceAll('&nbsp;', ' ');
    return result.trim();
}
export function extractCutContent(line) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{% cut'))
        return null;
    const match = trimmed.match(/\{%\s+cut\s+(.+?)\s*%\}/);
    if (!match)
        return null;
    let inner = match[1].trim();
    if ((inner.startsWith('"') && inner.endsWith('"')) ||
        (inner.startsWith("'") && inner.endsWith("'"))) {
        inner = inner.slice(1, -1);
    }
    return cleanText(inner);
}
export function classifyNonTableCell(line) {
    const trimmed = line.trim();
    if (trimmed === '')
        return null;
    const cutContent = extractCutContent(trimmed);
    if (cutContent !== null) {
        return { type: 'header', level: 2, content: cutContent };
    }
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
        return {
            type: 'header',
            level: headingMatch[1].length,
            content: cleanText(headingMatch[2]),
        };
    }
    return { type: 'text', content: cleanText(trimmed) };
}
export function extractCells(lines, start, end) {
    const rows = [];
    const currentRow = [];
    const currentCellParts = [];
    const flushCell = () => {
        const cell = currentCellParts.join('\n').trim();
        if (cell !== '' || currentRow.length > 0) {
            currentRow.push(sanitize(cell));
        }
        currentCellParts.length = 0;
    };
    const flushRow = () => {
        flushCell();
        if (currentRow.length > 0) {
            rows.push([...currentRow]);
        }
        currentRow.length = 0;
    };
    for (let i = start; i <= end; i++) {
        const trimmed = lines[i].trim();
        if (trimmed === '' && currentCellParts.length === 0) {
            continue;
        }
        else if (trimmed === '|') {
            flushCell();
        }
        else if (trimmed === '||') {
            flushCell();
            flushRow();
        }
        else {
            currentCellParts.push(trimmed);
        }
    }
    flushCell();
    flushRow();
    return rows;
}
export function classifyTable(headers, rows) {
    const normalizedHeaders = headers.map(h => sanitize(h).toLowerCase());
    if (normalizedHeaders.length >= 3 &&
        normalizedHeaders[0] === 'поле' &&
        normalizedHeaders[1] === 'описание' &&
        normalizedHeaders[2] === 'значение') {
        return 'type-1';
    }
    for (const row of rows) {
        for (const cell of row) {
            const s = sanitize(cell).toUpperCase();
            if (s === 'О' || s === 'НО')
                return 'type-2';
        }
    }
    return 'unknown';
}
export function parse(mdText) {
    const lines = mdText.split('\n');
    const converted = [];
    const errors = [];
    let i = 0;
    while (i < lines.length) {
        const trimmed = lines[i].trim();
        if (trimmed === '#|') {
            let j = i + 1;
            while (j < lines.length && lines[j].trim() !== '|#') {
                j++;
            }
            if (j < lines.length) {
                const rawRows = extractCells(lines, i + 1, j - 1);
                const headers = rawRows[0] ?? [];
                const dataRows = headers.length > 0 ? rawRows.slice(1) : [];
                const tableType = classifyTable(headers, dataRows);
                const tableNode = {
                    type: 'table',
                    tableType,
                    colCnt: headers.length,
                    ...(headers.length > 0 ? { headers } : {}),
                    rows: dataRows,
                };
                if (tableType !== 'type-1' && tableType !== 'type-2') {
                    errors.push(`Unknown table at line ${i + 1}: ${(headers ?? []).join(', ')}`);
                }
                converted.push(tableNode);
                i = j + 1;
            }
            else {
                errors.push(`Unclosed table start at line ${i + 1}`);
                converted.push(classifyNonTableCell(lines[i]) ?? { type: 'text', content: trimmed });
                i++;
            }
            continue;
        }
        const node = classifyNonTableCell(lines[i]);
        if (node) {
            converted.push(node);
        }
        i++;
    }
    return { converted, errors };
}
//# sourceMappingURL=Parser.js.map