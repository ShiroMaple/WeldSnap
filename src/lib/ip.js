/**
 * 局域网 IP 地址检测工具
 */

const os = require('node:os');

/**
 * 获取本机所有非内网（Non-Internal）IPv4 局域网地址
 * @returns {string[]} IP 列表
 */
function getLocalIPs() {
  const ifaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push(iface.address);
      }
    }
  }
  return ips;
}

module.exports = { getLocalIPs };
