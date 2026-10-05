/**
 * 生成 Word 样例文档（北京五日游）
 * 与网站内 word.js 的导出逻辑保持一致，用于预览 Word 导出效果
 * 运行：NODE_PATH=<workspace>/node_modules node tools/gen_word_sample.js
 */
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, AlignmentType, BorderStyle, ShadingType, VerticalAlign,
} = require("docx");
const fs = require("fs");
const path = require("path");

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

const TRIP = {
  name: "北京五日游",
  startDate: "2026-08-10",
  endDate: "2026-08-14",
  notes: [
    { title: "证件", body: "身份证、学生证" },
    { title: "天气提醒", body: "8 月多雨，请带雨伞" },
    { title: "交通", body: "建议提前下载地铁乘车码" },
  ],
  days: {
    "2026-08-10": [
      { start: "09:00", end: "10:30", title: "参观故宫博物院", location: "北京市东城区景山前街 4 号", intro: "明清两朝皇宫，世界文化遗产", remark: "建议提前 3 天网上预约门票" },
      { start: "11:00", end: "12:00", title: "午餐·四季民福烤鸭店", location: "王府井大街", intro: "", remark: "" },
      { start: "14:00", end: "17:00", title: "恭王府", location: "", intro: "清代规模最大的王府", remark: "" },
    ],
    "2026-08-11": [
      { start: "09:30", end: "11:30", title: "颐和园", location: "北京市海淀区新建宫门路 19 号", intro: "", remark: "乘地铁 4 号线北宫门站" },
      { start: "13:00", end: "15:00", title: "圆明园遗址公园", location: "北京市海淀区清华西路 28 号", intro: "", remark: "" },
    ],
    "2026-08-12": [],
    "2026-08-13": [
      { start: "10:00", end: "11:00", title: "国家博物馆", location: "", intro: "免费开放，需提前预约", remark: "" },
    ],
    "2026-08-14": [
      { start: "09:00", end: "10:00", title: "收拾行李退房", location: "", intro: "", remark: "12 点前退房，行李可寄存前台" },
    ],
  },
};

function dateList(start, end) {
  const out = [];
  const d = new Date(start + "T00:00:00");
  const last = new Date(end + "T00:00:00");
  while (d <= last) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    out.push(`${y}-${m}-${dd}`);
    d.setDate(d.getDate() + 1);
  }
  return out;
}

function fmtMD(dateStr) {
  const [, m, dd] = dateStr.split("-");
  return `${m}月${dd}日`;
}

function weekday(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return "星期" + WEEKDAYS[d.getDay()];
}

const BORDER = { style: BorderStyle.SINGLE, size: 4, color: "EAC291" };
const TABLE_BORDERS = {
  top: BORDER, bottom: BORDER, left: BORDER, right: BORDER,
  insideHorizontal: BORDER, insideVertical: BORDER,
};

function cell(text, opts = {}) {
  return new TableCell({
    width: { size: opts.width || 20, type: opts.widthType || WidthType.PERCENTAGE },
    shading: opts.fill ? { type: ShadingType.CLEAR, fill: opts.fill } : undefined,
    margins: { top: 80, bottom: 80, left: 100, right: 100 },
    verticalAlign: opts.verticalCenter ? VerticalAlign.CENTER : VerticalAlign.TOP,
    children: [new Paragraph({
      alignment: opts.align || AlignmentType.LEFT,
      spacing: { after: 0 },
      children: [new TextRun({ text: text || "", size: 20, bold: !!opts.bold, color: opts.color || "333333" })],
    })],
  });
}

function itemTable(items) {
  const header = new TableRow({
    children: [
      cell("时间段", { fill: "FDEBD8", bold: true, align: AlignmentType.CENTER, color: "B4550F", width: 1750, widthType: WidthType.DXA }),
      cell("旅游事项", { fill: "FDEBD8", bold: true, align: AlignmentType.CENTER, color: "B4550F", width: 7276, widthType: WidthType.DXA }),
    ],
  });
  const rows = items.map((it) => {
    const detailParas = [
      new Paragraph({
        spacing: { after: 30 },
        indent: { left: 240 },
        children: [new TextRun({ text: it.title || "", bold: true, size: 21, color: "333333" })],
      }),
    ];
    for (const [key, val] of [["地点", it.location], ["介绍", it.intro], ["备注", it.remark]]) {
      if (val && val.trim()) {
        detailParas.push(new Paragraph({
          spacing: { after: 30 },
          indent: { left: 240 },
          children: [new TextRun({ text: `${key}：${val}`, size: 20, color: "555555" })],
        }));
      }
    }
    return new TableRow({
      children: [
        cell(`${it.start}-${it.end}`, { width: 1750, widthType: WidthType.DXA, align: AlignmentType.CENTER, verticalCenter: true }),
        new TableCell({
          width: { size: 7276, type: WidthType.DXA },
          margins: { top: 80, bottom: 80, left: 100, right: 100 },
          children: detailParas,
        }),
      ],
    });
  });
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: TABLE_BORDERS,
    rows: [header, ...rows],
  });
}

async function main() {
  const days = dateList(TRIP.startDate, TRIP.endDate).map((d, i) => ({
    no: i + 1,
    date: d,
    items: TRIP.days[d] || [],
  }));

  const children = [];

  // 文档标题
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 80 },
    children: [new TextRun({ text: TRIP.name, bold: true, size: 48, color: "D9651C" })],
  }));
  // 副标题
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 300 },
    children: [new TextRun({ text: `${TRIP.startDate} 至 ${TRIP.endDate} · 共 ${days.length} 天`, size: 22, color: "666666" })],
  }));

  // 注意事项
  if (TRIP.notes.length) {
    children.push(new Paragraph({
      spacing: { before: 120, after: 100 },
      children: [new TextRun({ text: "注意事项", bold: true, size: 28, color: "D9651C" })],
    }));
    for (const n of TRIP.notes) {
      children.push(new Paragraph({
        indent: { left: 200 },
        spacing: { after: 40 },
        children: [new TextRun({ text: `• ${n.title}：${n.body}`, size: 21 })],
      }));
    }
  }

  // 逐天章节
  for (const day of days) {
    children.push(new Paragraph({
      spacing: { before: 280, after: 100 },
      children: [new TextRun({ text: `第 ${day.no} 天 · ${fmtMD(day.date)} · ${weekday(day.date)}`, bold: true, size: 26, color: "333333" })],
    }));
    if (day.items.length === 0) {
      children.push(new Paragraph({
        spacing: { after: 80 },
        children: [new TextRun({ text: "（无事项安排）", size: 20, color: "999999" })],
      }));
    } else {
      children.push(itemTable(day.items));
    }
    // 每两天之间空一行
    if (day.no < days.length) {
      children.push(new Paragraph({ children: [] }));
    }
  }

  const doc = new Document({
    styles: { default: { document: { run: { font: "微软雅黑", size: 21 } } } },
    sections: [{ children }],
  });

  const buf = await Packer.toBuffer(doc);
  const out = path.resolve(__dirname, "..", process.argv[2] || "样例_北京五日游.docx");
  fs.writeFileSync(out, buf);
  console.log("Word sample generated:", out, "(", buf.length, "bytes )");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
