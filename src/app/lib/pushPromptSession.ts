export function androidPushPromptSessionKey(userId: string) {
  return `cruush:android-push-login:v1:${userId}`;
}

// A fresh sign-in should offer Android push again if it is still off, while
// navigation and page reloads retain the current login's dismissal.
export function resetPushPromptForLogin(userId: string) {
  window.sessionStorage.removeItem(androidPushPromptSessionKey(userId));
}
