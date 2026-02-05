// Fallback: IAP not available on this platform.
// On native, Metro resolves iap.native.ts which exports react-native-iap.
// On web, Metro resolves iap.web.ts which exports null.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const IAP: any = null;
export default IAP;
