const HIDDEN_SUFFIX = '__hidden_columns';
const RENAMED_SUFFIX = '__renamed_columns';
export function getStorageKey(fileName, type) {
    return fileName + (type === 'hidden' ? HIDDEN_SUFFIX : RENAMED_SUFFIX);
}
export function loadSettings(fileName) {
    const hiddenRaw = localStorage.getItem(getStorageKey(fileName, 'hidden'));
    const renamedRaw = localStorage.getItem(getStorageKey(fileName, 'renamed'));
    return {
        hidden: hiddenRaw ? JSON.parse(hiddenRaw) : [],
        renamed: renamedRaw ? JSON.parse(renamedRaw) : {},
    };
}
export function saveSettings(fileName, settings) {
    localStorage.setItem(getStorageKey(fileName, 'hidden'), JSON.stringify(settings.hidden));
    localStorage.setItem(getStorageKey(fileName, 'renamed'), JSON.stringify(settings.renamed));
}
export function applySettings(compiled, settings) {
    const hiddenSet = new Set(settings.hidden);
    const renamedMap = settings.renamed;
    for (const group of compiled.groups) {
        group.columns = group.columns.filter(col => !hiddenSet.has(col.key));
        for (const col of group.columns) {
            const newLabel = renamedMap[col.key];
            if (newLabel)
                col.label = newLabel;
        }
        if (group.type2Item && group.type2Columns) {
            group.type2Columns = group.type2Columns.filter(col => !hiddenSet.has(col.key));
            for (const col of group.type2Columns) {
                const newLabel = renamedMap[col.key];
                if (newLabel)
                    col.label = newLabel;
            }
        }
    }
}
export function collectAllColumnKeys(compiled) {
    const seen = new Set();
    const result = [];
    for (const group of compiled.groups) {
        for (const col of group.columns) {
            if (!seen.has(col.key)) {
                seen.add(col.key);
                result.push(col.key);
            }
        }
        if (group.type2Columns) {
            for (const col of group.type2Columns) {
                if (!seen.has(col.key)) {
                    seen.add(col.key);
                    result.push(col.key);
                }
            }
        }
    }
    return result;
}
export function copySettingsFrom(sourceFileName, compiled, targetSettings, currentAllKeys) {
    const currentKeys = new Set(currentAllKeys ?? collectAllColumnKeys(compiled));
    const source = loadSettings(sourceFileName);
    const hidden = source.hidden.filter(k => currentKeys.has(k));
    const renamed = {};
    for (const [key, label] of Object.entries(source.renamed)) {
        if (currentKeys.has(key)) {
            renamed[key] = label;
        }
    }
    return { hidden, renamed };
}
//# sourceMappingURL=ColumnSettings.js.map