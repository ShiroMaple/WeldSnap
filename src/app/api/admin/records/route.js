/**
 * 管理员获取焊口明细记录接口
 * GET /api/admin/records
 */

const { withTrace } = require('../../../../middleware/withTrace');
const { requireAdmin } = require('../../../../middleware/auth');
const db = require('../../../../lib/db');

async function handler(request) {
  requireAdmin(request);

  const { searchParams } = new URL(request.url);
  const filters = {
    pipeline_no: searchParams.get('pipeline_no') || '',
    weld_no: searchParams.get('weld_no') || '',
    status: searchParams.get('status') || '',
  };

  const records = db.getAllRecords(filters);
  return Response.json({ success: true, records });
}

export const GET = withTrace(handler);

