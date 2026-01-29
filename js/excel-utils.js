// ================= 辅助函数：Excel 格式化 =================
function getExcelPercent(val) {
    if (typeof val !== 'number' || isNaN(val)) return '-';
    return { t: 'n', v: val, z: '0.00%' };
}
function getExcelNum(val, decimals = 2) {
    if (typeof val !== 'number' || isNaN(val)) return '-';
    return { t: 'n', v: parseFloat(val.toFixed(decimals)) };
}

// 定义一套专业的样式配置
const XLS_STYLES = {
    // 表头样式
    HEADER: {
        font: { bold: true, sz: 12, color: { rgb: "333333" }, name: "Microsoft YaHei" },
        fill: { fgColor: { rgb: "E5E7EB" } }, // 浅灰背景
        border: { top: {style:'thin'}, bottom: {style:'medium'}, left: {style:'thin'}, right: {style:'thin'} },
        alignment: { horizontal: "center", vertical: "center", wrapText: true }
    },
    // 普通单元格
    CELL: {
        font: { sz: 11, name: "Arial" },
        border: { top: {style:'thin', color: {rgb:"E5E7EB"}}, bottom: {style:'thin', color: {rgb:"E5E7EB"}}, left: {style:'thin', color: {rgb:"E5E7EB"}}, right: {style:'thin', color: {rgb:"E5E7EB"}} },
        alignment: { horizontal: "center", vertical: "center" }
    },
    // 排名高亮 (前三名)
    RANK_TOP: {
        font: { bold: true, color: { rgb: "DC2626" } } // 红色
    },
    // 优秀 (绿色)
    SCORE_GOOD: {
        font: { color: { rgb: "16A34A" }, bold: true }
    },
    // 不及格 (红色)
    SCORE_BAD: {
        font: { color: { rgb: "DC2626" } }
    }
};

/**
 * 一键美化 Worksheet 对象
 * @param {Object} ws SheetJS 的 worksheet 对象
 * @param {Array} headers 表头数组（用于判断列类型）
 */
function decorateExcelSheet(ws, headers = []) {
    if(!ws['!ref']) return;
    
    const range = XLSX.utils.decode_range(ws['!ref']);
    const colWidths = [];

    for (let R = range.s.r; R <= range.e.r; ++R) {
        for (let C = range.s.c; C <= range.e.c; ++C) {
            const cellRef = XLSX.utils.encode_cell({ c: C, r: R });
            if (!ws[cellRef]) continue;

            const cell = ws[cellRef];
            const headerName = headers[C] || ""; // 获取当前列的表头名
            
            // 1. 基础样式应用
            let style = JSON.parse(JSON.stringify(R === 0 ? XLS_STYLES.HEADER : XLS_STYLES.CELL));
            
            // 2. 表头特殊处理
            if (R === 0) {
                // 如果是“总分”或“排名”，加深背景
                if (String(cell.v).includes("总分") || String(cell.v).includes("排名")) {
                    style.fill.fgColor = { rgb: "D1FAE5" }; // 浅绿
                }
            } 
            // 3. 数据行智能处理
            else {
                // 🦓 斑马纹 (偶数行微灰)
                if (R % 2 === 0) style.fill = { fgColor: { rgb: "F9FAFB" } };

                // 🏆 排序列处理
                if (headerName.includes("排名") || headerName.includes("名次")) {
                    if (cell.v === 1 || cell.v === 2 || cell.v === 3) {
                        Object.assign(style.font, XLS_STYLES.RANK_TOP.font);
                        style.fill = { fgColor: { rgb: "FEF3C7" } }; // 浅黄底
                    }
                }
                
                // 📉 分数/率 处理
                if (typeof cell.v === 'number') {
                    // 及格率/优秀率 < 60% 标红 (如果是百分比数值 0.6)
                    if (headerName.includes("率") && cell.v < 0.6) {
                        Object.assign(style.font, XLS_STYLES.SCORE_BAD.font);
                    }
                    // 分数 < 60 标红 (假设满分100以上)
                    if ((headerName.includes("分") || headerName.includes("绩")) && cell.v < 60 && cell.v > 0) {
                        Object.assign(style.font, XLS_STYLES.SCORE_BAD.font);
                    }
                }
                
                // 文本对齐优化：姓名、学校左对齐
                if (headerName.includes("姓名") || headerName.includes("学校") || headerName.includes("班级")) {
                    style.alignment.horizontal = "left";
                    // 增加一点缩进
                    style.alignment.indent = 1;
                }
            }

            // 应用样式
            cell.s = style;

            // 4. 计算列宽 (简单估算)
            const valLen = (cell.v ? String(cell.v).length : 0) * 1.5;
            colWidths[C] = Math.max(colWidths[C] || 5, valLen > 50 ? 50 : valLen); // 限制最大宽度
        }
    }

    // 应用列宽
    ws['!cols'] = colWidths.map(w => ({ wch: w + 2 })); // 加一点padding
    
    // 冻结首行
    ws['!freeze'] = { xSplit: 0, ySplit: 1 };
}
