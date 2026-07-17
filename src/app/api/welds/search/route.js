export const dynamic = 'force-dynamic';
/**
 * 模糊搜索管线号接口
 * GET /api/welds/search?q=xxx
 */

const { withTrace } = require('../../../../middleware/withTrace');
const { requireAuth } = require('../../../../middleware/auth');
const db = require('../../../../lib/db');

async function handler(request) {
  // 必须登录后才能搜索
  requireAuth(request);

  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q') || '';

  if (!q.trim()) {
    return Response.json({ success: true, results: [] });
  }

  const results = db.searchPipelines(q.trim());
  return Response.json({ success: true, results });
}

export const GET = withTrace(handler);

