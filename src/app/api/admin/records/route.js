export const dynamic = 'force-dynamic';
/**
 * 焊口记录查询与管理 API 接口 (管理员权限)
 * GET /api/admin/records?pipeline_uuid=... - 查询某管线下的焊口记录列表（支持过滤）
 */

const { withTrace } = require('../../../../middleware/withTrace');
const { requireAdmin } = require('../../../../middleware/auth');
const db = require('../../../../lib/db');

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
    if (filterStatus === 'completed') {
      welds = welds.filter(w => 
        w.photo_zudui && !w.photo_zudui.startsWith('REJECTED:') &&
        w.photo_dadi && !w.photo_dadi.startsWith('REJECTED:') &&
        w.photo_gaimian && !w.photo_gaimian.startsWith('REJECTED:')
      );
    } else if (filterStatus === 'pending') {
      welds = welds.filter(w => 
        !w.photo_zudui || w.photo_zudui.startsWith('REJECTED:') ||
        !w.photo_dadi || w.photo_dadi.startsWith('REJECTED:') ||
        !w.photo_gaimian || w.photo_gaimian.startsWith('REJECTED:')
      );
    }
  }

  return Response.json({ success: true, records: welds });
}

export const GET = withTrace(getHandler);
