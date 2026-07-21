'use client';

/**
 * OSS 归档文件树浏览器组件 (Client Component)
 *
 * 职责：
 *   - 加载并递归展示由 `/api/admin/export-folder` 提供的 OSS projects/ 归档树
 *   - 用户可展开/折叠文件夹
 *   - 点击照片文件直接触发 `/api/admin/download?path=...` 重定向至 OSS 执行安全下载
 */

import { useState, useEffect } from 'react';

export default function OSSFileTree() {
  const [treeData, setTreeData] = useState([]);
  const [rootPath, setRootPath] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // 记录每个文件夹路径的展开/收起状态
  const [expandedDirs, setExpandedDirs] = useState({});

  const fetchTree = async () => {
    setLoading(true);
    setError('');
    try {
      const resp = await fetch('/api/admin/export-folder');
      const data = await resp.json();
      if (resp.ok && data.success) {
        setTreeData(data.tree || []);
        setRootPath(data.root || '');
      } else {
        setError(data.error || '获取文件列表失败');
      }
    } catch (err) {
      setError('网络连接错误，无法读取云端文件');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTree();
  }, []);

  const toggleDir = (dirPath) => {
    setExpandedDirs((prev) => ({
      ...prev,
      [dirPath]: !prev[dirPath],
    }));
  };

  // 递归渲染节点函数
  const renderNode = (nodes, depth = 0) => {
    return (
      <ul className="list-none m-0 p-0" style={{ paddingLeft: depth > 0 ? '20px' : '0px' }}>
        {nodes.map((node) => {
          const isDir = node.type === 'dir';

          if (isDir) {
            const isExpanded = !!expandedDirs[node.path];
            return (
              <li key={node.path} className="py-1">
                <div
                  onClick={() => toggleDir(node.path)}
                  className="flex items-center gap-2 py-1 px-2 hover:bg-[#f4f4f4] cursor-pointer select-none text-[13px] text-[#161616]"
                >
                  <span className="text-[14px]">{isExpanded ? '📂' : '📁'}</span>
                  <span className="font-medium">{node.name}</span>
                </div>
                {isExpanded && node.children && node.children.length > 0 && (
                  <div>{renderNode(node.children, depth + 1)}</div>
                )}
                {isExpanded && (!node.children || node.children.length === 0) && (
                  <div className="py-1 pl-8 text-[12px] text-[#8d8d8d]">
                    (空文件夹)
                  </div>
                )}
              </li>
            );
          } else {
            // 文件节点
            const sizeKB = (node.size / 1024).toFixed(1);
            return (
              <li key={node.path} className="py-1">
                <div className="flex items-center gap-2 py-1 px-2 hover:bg-[#f4f4f4] text-[13px]">
                  <span className="text-[14px]">📷</span>
                  <a
                    href={`/api/admin/download?path=${encodeURIComponent(node.path)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#0f62fe] hover:underline"
                  >
                    {node.name}
                  </a>
                  <span className="text-[11px] text-[#8d8d8d]">
                    ({sizeKB} KB)
                  </span>
                </div>
              </li>
            );
          }
        })}
      </ul>
    );
  };

  if (loading) {
    return (
      <div className="py-8 text-center text-[#525252] text-[13px]">
        正在读取 OSS 云端文件树...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-[#fff2f0] border border-[#ffccc7] text-[#da1e28] text-[13px] flex items-center justify-between">
        <span>{error}</span>
        <button
          onClick={fetchTree}
          className="px-3 py-1 bg-[#da1e28] text-white border-none cursor-pointer text-[12px] hover:bg-[#b81921]"
        >
          重试
        </button>
      </div>
    );
  }

  return (
    <div className="select-none">
      <header className="mb-4 pb-2 border-b border-[#e0e0e0] flex items-center justify-between">
        <div className="text-[12px] text-[#8d8d8d]">
          归档根目录: <span className="text-[#161616]">{rootPath}</span>
        </div>
        <button
          onClick={fetchTree}
          className="h-8 px-4 bg-[#393939] hover:bg-[#4c4c4c] active:bg-[#6f6f6f] text-white text-[12px] cursor-pointer border-none outline-none"
        >
          刷新列表
        </button>
      </header>

      {treeData.length === 0 ? (
        <div className="py-12 text-center text-[#8d8d8d] text-[13px]">
          OSS 桶中暂无 projects/ 归档照片数据，请先前往移动端拍照录入。
        </div>
      ) : (
        <div className="border border-[#e0e0e0] p-4 bg-white overflow-x-auto max-h-[500px]">
          {renderNode(treeData)}
        </div>
      )}
    </div>
  );
}
