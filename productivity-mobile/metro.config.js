const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const originalRewriteRequestUrl = config.server?.rewriteRequestUrl;

config.server = {
  ...(config.server || {}),
  rewriteRequestUrl: (requestUrl) => {
    const rewritten =
      typeof originalRewriteRequestUrl === 'function'
        ? originalRewriteRequestUrl(requestUrl)
        : requestUrl;

    try {
      const parsed = new URL(rewritten, 'http://localhost');
      const isBundleLikeRequest = /\.(bundle|map|assets)$/i.test(parsed.pathname);

      // Some dev-client reconnect flows send requests without platform.
      // Metro can throw internal errors on those, so force android as a safe default.
      if (isBundleLikeRequest && !parsed.searchParams.get('platform')) {
        parsed.searchParams.set('platform', 'android');
      }

      return `${parsed.pathname}${parsed.search}`;
    } catch {
      return rewritten;
    }
  },
};

module.exports = config;
