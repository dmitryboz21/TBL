export function groupTables(parsed) {
    const groups = [];
    const remainingUnknowns = [];
    const errors = [...parsed.errors];
    const pendingItems = [];
    const bufferedHeaders = [];
    const bufferedTexts = [];
    let currentGroup = null;
    let groupIndex = 0;
    const getGroup = () => currentGroup;
    const createGroup = () => {
        const grp = {
            groupIndex,
            type1Items: [],
            headers: [...bufferedHeaders],
            texts: [...bufferedTexts],
            tables: [],
        };
        bufferedHeaders.length = 0;
        bufferedTexts.length = 0;
        groups.push(grp);
        groupIndex++;
        currentGroup = grp;
        return grp;
    };
    for (const item of parsed.converted) {
        switch (item.type) {
            case 'table': {
                switch (item.tableType) {
                    case 'type-1': {
                        const grp = getGroup();
                        if (grp && grp.type2Item) {
                            const newGrp = createGroup();
                            newGrp.tables.push({ table: item, items: [...pendingItems] });
                            newGrp.type1Items.push(item);
                        }
                        else {
                            const currentGrp = grp ?? createGroup();
                            currentGrp.tables.push({ table: item, items: [...pendingItems] });
                            currentGrp.type1Items.push(item);
                        }
                        pendingItems.length = 0;
                        break;
                    }
                    case 'type-2': {
                        const grp = getGroup();
                        if (grp && grp.tables.length > 0) {
                            const last = grp.tables[grp.tables.length - 1];
                            if (last) {
                                last.items.push(...pendingItems);
                            }
                            grp.type2Item = item;
                        }
                        pendingItems.length = 0;
                        break;
                    }
                    case 'unknown': {
                        remainingUnknowns.push({ markdown: '', cells: item.rows });
                        const grp = getGroup();
                        if (grp && grp.tables.length > 0) {
                            const last = grp.tables[grp.tables.length - 1];
                            if (last) {
                                last.items.push(...pendingItems);
                            }
                        }
                        pendingItems.length = 0;
                        currentGroup = null;
                        break;
                    }
                }
                break;
            }
            case 'header': {
                const grp = getGroup();
                if (grp) {
                    grp.headers.push(item);
                }
                else {
                    bufferedHeaders.push(item);
                }
                pendingItems.push(item);
                break;
            }
            case 'text': {
                const grp = getGroup();
                if (grp) {
                    grp.texts.push(item);
                }
                else {
                    bufferedTexts.push(item);
                }
                pendingItems.push(item);
                break;
            }
        }
    }
    const finalGrp = getGroup();
    if (finalGrp && finalGrp.tables.length > 0 && pendingItems.length > 0) {
        const last = finalGrp.tables[finalGrp.tables.length - 1];
        if (last) {
            last.items.push(...pendingItems);
        }
    }
    return { groups, remainingUnknowns, errors };
}
//# sourceMappingURL=PostProcessor.js.map