/**
 * 根据管线号获取焊口列表接口
 * GET /api/welds/by-pipeline/[pipeline_no]
 */

const { withTrace } = require('../../../../../middleware/withTrace');
const { requireAuth } = require('../../../../../middleware/auth');
const db = require('../../../../../lib/db');

async function handler(request, { params }) {
  // 普通施工人员或管理员均可访问，需已登录
  requireAuth(request);

  const resolvedParams = await params;
  const pipelineNo = decodeURIComponent(resolvedParams.pipeline_no);

  if (!pipelineNo) {
    return Response.json({ success: false, error: '缺少管线号参数' }, { status: 400 });
  }

  const welds = db.getWeldsByPipelineNo(pipelineNo);
  return Response.json({ success: true, welds });
}

export const GET = withTrace(handler);

