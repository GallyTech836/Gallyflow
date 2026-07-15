const appId = process.env.ONESIGNAL_APP_ID;
const restApiKey = process.env.ONESIGNAL_REST_API_KEY;

if (!appId || !restApiKey) {
  console.warn(
    '[onesignal] ONESIGNAL_APP_ID / ONESIGNAL_REST_API_KEY no están configuradas todavía.'
  );
}

export const oneSignalConfig = {
  appId,
  restApiKey,
  apiUrl: 'https://api.onesignal.com/notifications',
};