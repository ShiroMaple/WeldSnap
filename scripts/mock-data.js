/**
 * 清空所有工程项目数据并生成 Mock 数据
 * 用法: node --experimental-sqlite scripts/mock-data.js
 */

const db = require('../src/lib/db');

// ─── 清空 ──────────────────────────────────────────────
console.log('正在清空现有数据...');
db.db.exec('DELETE FROM weld_records');
db.db.exec('DELETE FROM pipelines');
db.db.exec('DELETE FROM projects');
console.log('已清空 projects / pipelines / weld_records\n');

// ─── 辅助 ──────────────────────────────────────────────
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randStr(len) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < len; i++) s += chars[randInt(0, chars.length - 1)];
  return s;
}

// ─── Mock 项目配置 ─────────────────────────────────────
const mockProjects = [
  {
    name: '测试项目-炼油厂大修',
    pipelines: 4,
    weldsRange: [3, 6],
  },
  {
    name: '测试项目-乙烯装置检修',
    pipelines: 3,
    weldsRange: [4, 8],
  },
  {
    name: '测试项目-储罐区改造',
    pipelines: 3,
    weldsRange: [2, 5],
  },
];

const pipelinePrefixes = ['PL', 'GX', 'LX'];
const weldPrefixes = ['W', 'H', 'J'];

// ─── 生成 ──────────────────────────────────────────────
for (let i = 0; i < mockProjects.length; i++) {
  const proj = mockProjects[i];
  const constructionNo = `SG-${randStr(4)}-${String(i + 1).padStart(2, '0')}`;
  const pPrefix = pipelinePrefixes[i];
  const wPrefix = weldPrefixes[i];

  const projResult = db.createProject(
    constructionNo,
    proj.name,
    `自动生成的测试数据`,
    pPrefix,
    wPrefix
  );

  if (!projResult.success) {
    console.error(`创建项目失败: ${proj.name}`, projResult);
    continue;
  }

  const projUuid = projResult.uuid;
  console.log(`✓ 项目: ${proj.name}  |  施工号: ${constructionNo}  |  前缀: ${pPrefix}/${wPrefix}`);

  for (let p = 0; p < proj.pipelines; p++) {
    const plResult = db.createPipeline(projUuid);
    if (!plResult.success) {
      console.error(`  创建管线失败:`, plResult);
      continue;
    }

    const plUuid = plResult.uuid;
    const plNo = plResult.pipeline_no;
    const weldCount = randInt(proj.weldsRange[0], proj.weldsRange[1]);

    let weldNos = [];
    for (let w = 0; w < weldCount; w++) {
      const wResult = db.createWeld(plUuid);
      if (wResult.success) {
        weldNos.push(wResult.weld_no);
      }
    }

    console.log(`  ✓ 管线: ${plNo}  →  焊口: ${weldNos.join(', ')}`);
  }

  console.log('');
}

// ─── 统计 ──────────────────────────────────────────────
const projCount = db.db.prepare('SELECT COUNT(*) as c FROM projects').get().c;
const plCount = db.db.prepare('SELECT COUNT(*) as c FROM pipelines').get().c;
const weldCount = db.db.prepare('SELECT COUNT(*) as c FROM weld_records').get().c;
console.log('────────────────────────────────');
console.log(`项目: ${projCount}  |  管线: ${plCount}  |  焊口: ${weldCount}`);
