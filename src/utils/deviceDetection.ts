/**
 * Device detection utilities
 */

export type DeviceType = 'mobile' | 'tablet' | 'desktop';

/**
 * Detects the current device type based on user agent and platform
 */
export function getDeviceType(): DeviceType {
  const userAgent = navigator.userAgent.toLowerCase();
  const platform = navigator.platform.toLowerCase();
  
  // Check for mobile devices via user agent
  const isMobileUA = /iphone|ipod|android.*mobile|windows phone|blackberry|bb10|opera mini|iemobile/i.test(userAgent);
  
  // Check for tablet devices via user agent
  const isTabletUA = /ipad|android(?!.*mobile)|tablet|kindle|silk|playbook/i.test(userAgent);
  
  // Check for touch capability
  const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  
  // iOS detection (includes iPad which may report as desktop in iPadOS 13+)
  const isIOS = /ipad|iphone|ipod/.test(userAgent) || (platform === 'macintel' && hasTouch);
  
  if (isMobileUA) {
    return 'mobile';
  }
  
  if (isTabletUA || (isIOS && !isMobileUA)) {
    return 'tablet';
  }
  
  // Fallback: use screen size as secondary check
  const width = window.innerWidth;
  if (hasTouch && width < 768) {
    return 'mobile';
  }
  
  if (hasTouch && width >= 768 && width <= 1024) {
    return 'tablet';
  }
  
  return 'desktop';
}

/**
 * Check if the current device can report incidents (mobile or tablet only)
 */
export function canReportIncident(): boolean {
  const deviceType = getDeviceType();
  return deviceType === 'mobile' || deviceType === 'tablet';
}

/**
 * Check if the current device is mobile
 */
export function isMobile(): boolean {
  return getDeviceType() === 'mobile';
}

/**
 * Check if the current device is desktop/laptop
 */
export function isDesktop(): boolean {
  return getDeviceType() === 'desktop';
}

/**
 * Check if the current device is a tablet
 */
export function isTablet(): boolean {
  return getDeviceType() === 'tablet';
}

/**
 * Check if the current device is mobile or tablet
 */
export function isMobileOrTablet(): boolean {
  const deviceType = getDeviceType();
  return deviceType === 'mobile' || deviceType === 'tablet';
}