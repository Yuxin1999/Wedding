const config = require('./config');
const invitation = require('./utils/invitation');

App({
  onLaunch(options) {
    invitation.capture(options);
    if (config.cloudEnv && wx.cloud) {
      wx.cloud.init({ env: config.cloudEnv, traceUser: false });
    }
  },
  onShow(options) { invitation.capture(options); }
});
