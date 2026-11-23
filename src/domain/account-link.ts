/** Reserved for a later optional Google sign-in. Nothing here contacts Google. */
export interface AccountLink {
  provider: "google";
  subject: string;
  browserId: string;
}

export function beginGoogleSignIn(): AccountLink | null {
  return null;
}
