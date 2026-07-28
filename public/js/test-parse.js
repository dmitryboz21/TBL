var _a;
import { readFileSync } from 'fs';
import { parse } from './Parser.js';
const md = readFileSync('../examples/log_tz_short.md', 'utf-8');
const result = parse(md);
console.log('=== First 30 converted items ===');
for (let i = 0; i < Math.min(30, result.converted.length); i++) {
    const item = result.converted[i];
    if (item.type === 'header') {
        console.log(`[${i}] header h${item.level}: "${item.content}"`);
    }
    else if (item.type === 'text') {
        console.log(`[${i}] text: "${item.content}"`);
    }
    else if (item.type === 'table') {
        console.log(`[${i}] TABLE type-${item.tableType}, cols=${item.colCnt}, rows=${item.rows.length}`);
        console.log(`     headers: ${((_a = item.headers) !== null && _a !== void 0 ? _a : []).join(', ')}`);
        for (const row of item.rows.slice(0, 3)) {
            console.log(`     row: [${row.join(', ')}]`);
        }
        if (item.rows.length > 3)
            console.log(`     ... +${item.rows.length - 3} more rows`);
    }
}
console.log(`\n=== Summary: ${result.converted.length} items, ${result.errors.length} errors ===`);
console.log('Errors:', result.errors);
const types = { header: 0, text: 0, table: 0 };
for (const item of result.converted) {
    types[item.type]++;
}
console.log('Type counts:', types);
//# sourceMappingURL=test-parse.js.map