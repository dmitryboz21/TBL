import { applySettings } from './ColumnSettings.js';
function escapeComment(content) {
    return content.replace(/\*\//g, '*\\/');
}
function escapeJsonValue(value) {
    return value
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r')
        .replace(/\t/g, '\\t');
}
function formatDataRow(row, columns) {
    const entries = [];
    for (const col of columns) {
        const value = (row[col.key] ?? '').trim();
        if (value) {
            entries.push('  "' + escapeJsonValue(col.label) + '": "' + escapeJsonValue(value) + '"');
        }
    }
    if (entries.length === 0)
        return '{}';
    return '{\n' + entries.join(',\n') + '\n}';
}
export function toJsonc(compiled, settings) {
    const result = JSON.parse(JSON.stringify(compiled));
    applySettings(result, settings);
    const lines = [];
    for (let gi = 0; gi < result.groups.length; gi++) {
        const group = result.groups[gi];
        const descEntries = group.columns
            .filter(col => col.description)
            .map(col => '  "' + escapeJsonValue(col.label) + '": "' + escapeJsonValue(col.description) + '"');
        if (descEntries.length > 0) {
            lines.push('{\n' + descEntries.join(',\n') + '\n}');
        }
        for (const row of group.outputRows) {
            switch (row.kind) {
                case 'header':
                case 'text':
                    lines.push('/* ' + escapeComment(row.content.trim()) + ' */');
                    break;
                case 'data':
                    lines.push(formatDataRow(row.dataRow, group.columns));
                    break;
            }
        }
        if (gi < result.groups.length - 1) {
            lines.push('');
        }
    }
    return lines.join('\n');
}
//# sourceMappingURL=JsonExporter.js.map