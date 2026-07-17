/** @type {import('next').NextConfig} */
const nextConfig = {
  // 仅在非 Windows (如 Linux CI/CD 容器) 环境下输出 standalone 格式以规避 Windows symlink EPERM 权限错误
  output: process.platform === 'win32' ? undefined : 'standalone',


  // 防止 Webpack 打包 Pino worker_threads 等外部依赖
  serverExternalPackages: [
    'pino',
    'pino-pretty',
    'pino-roll',
    'ali-oss',
    'bcryptjs',
    'xlsx',
    'qrcode',
    'sonic-boom',
  ],

  outputFileTracingIncludes: {
    '/api/auth/login': [
      './node_modules/date-fns/**/*',
    ],
  },

  // 显式排除 node:sqlite 等原生 Node.js 模块，防止 Webpack 尝试打包
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = config.externals || [];
      // 拦截所有 node: 协议的内置模块引用
      config.externals.push(({ request }, callback) => {
        if (/^node:/.test(request)) {
          return callback(null, 'commonjs ' + request);
        }
        callback();
      });
    }

    // 使用确定性 chunk ID（基于模块路径的短哈希），避免热重载时数字 ID 漂移导致
    // "Cannot find module './xxx.js'" 错误。这不影响生产构建产物大小。
    config.optimization = {
      ...config.optimization,
      moduleIds: 'deterministic',
      chunkIds: 'deterministic',
    };

    return config;
  },

  // 允许 OSS 图片域名（后续根据实际 bucket 域名扩展）
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.aliyuncs.com',
      },
    ],
  },
};

export default nextConfig;
