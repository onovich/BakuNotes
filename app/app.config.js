module.exports = ({ config }) => ({
  ...config,
  experiments: { ...config.experiments, ...(process.env.BAKU_WEB_BASE ? { baseUrl: process.env.BAKU_WEB_BASE } : {}) },
  ios: { ...config.ios, ...(process.env.BAKU_IOS_BUNDLE_ID ? { bundleIdentifier: process.env.BAKU_IOS_BUNDLE_ID } : {}) },
});
