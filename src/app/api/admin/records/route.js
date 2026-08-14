export const dynamic = 'force-dynamic';
/**
 * 焊口记录查询与管理 API 接口 (管理员权限)
 * GET /api/admin/records?pipeline_uuid=... - 查询某管线下的焊口记录列表（支持过滤）
 */

const { withTrace } = require('../../../../middleware/withTrace');
const { requireAdmin } = require('../../../../middleware/auth');
const db = require('../../../../lib/db');
const photoTypes = require('../../../../lib/photo-types');

async function getHandler(request) {
  requireAdmin(request);

  const { searchParams } = new URL(request.url);
  const pipelineUuid = searchParams.get('pipeline_uuid');

  if (!pipelineUuid) {
    return Response.json({ success: false, error: '缺少 pipeline_uuid 参数' }, { status: 400 });
  }

  let welds = db.listWelds(pipelineUuid);

  // 前端过滤参数
  const filterWeld = searchParams.get('weld_no');
  const filterStatus = searchParams.get('status');

  if (filterWeld && filterWeld.trim()) {
    const q = filterWeld.trim().toLowerCase();
    welds = welds.filter(w => w.weld_no.toLowerCase().includes(q));
  }

  if (filterStatus) {
    const pipeline = db.getPipelineByUuid(pipelineUuid);
    const project = pipeline
      ? db.db.prepare('SELECT processes FROM projects WHERE id = ?').get(pipeline.project_id)
      : null;
    const keys = project ? photoTypes.parseProcessKeys(project.processes) : photoTypes.DEFAULT_PROCESS_KEYS;

    if (filterStatus === 'completed') {
      welds = welds.filter(w =>
        keys.every(k => w[`photo_${k}`] && !w[`photo_${k}`].startsWith('REJECTED:'))
      );
    } else if (filterStatus === 'pending') {
      welds = welds.filter(w =>
        keys.some(k => !w[`photo_${k}`] || w[`photo_${k}`].startsWith('REJECTED:'))
      );
    }
  }

  return Response.json({ success: true, records: welds });
}

export const GET = withTrace(getHandler);
