import { config } from './config.js';

export const authorisedVideoHosts = () => [...new Set([...config.authorisedVideoHosts, ...(config.animedocApiKey ? ['*.aoneroom.com'] : [])])];

export function isAuthorisedVideo(url: string) {
  if (/^\/uploads\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.[a-zA-Z0-9]+$/.test(url)) return true;
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' || u.username || u.password || (config.animedocApiKey && url.includes(config.animedocApiKey))) return false;
    return authorisedVideoHosts().some((host) => host.startsWith('*.') ? u.hostname.endsWith(host.slice(1)) : u.hostname === host);
  } catch { return false; }
}
