const STORAGE_KEY = 'tr-local-config-v2'

export function isOnboardingComplete(): boolean {
  return localStorage.getItem('tr-onboarding-complete') === '1'
}

export function resetOnboarding() {
  localStorage.removeItem(STORAGE_KEY)
  localStorage.removeItem('tr-onboarding-complete')
}
