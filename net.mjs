// Network boundary helpers: the host only talks to this computer and private (LAN) addresses.
import net from 'node:net';
import os from 'node:os';

/** True for loopback, private IPv4 ranges, link-local, and IPv6 local ranges. */
export function isPrivateAddress(address) {
  if (typeof address !== 'string' || address === '') return false;
  let a = address.toLowerCase();
  const zone = a.indexOf('%');
  if (zone !== -1) a = a.slice(0, zone);
  if (a.startsWith('::ffff:') && net.isIPv4(a.slice(7))) a = a.slice(7);
  if (net.isIPv4(a)) {
    const [x, y] = a.split('.').map(Number);
    return x === 10 || x === 127 || (x === 172 && y >= 16 && y <= 31) ||
      (x === 192 && y === 168) || (x === 169 && y === 254);
  }
  if (net.isIPv6(a)) {
    return a === '::1' || /^fe[89ab]/.test(a) || /^f[cd]/.test(a);
  }
  return false;
}

/** Private IPv4 addresses of this computer, for telling players what to open. */
export function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const info of list || []) {
      if (info.family === 'IPv4' && !info.internal && isPrivateAddress(info.address)) out.push(info.address);
    }
  }
  return out;
}
