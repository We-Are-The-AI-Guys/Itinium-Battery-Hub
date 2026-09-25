// Use the published portal, never the current page: preview URLs and page query
// strings can be unsuitable (or unsafe) to send to another person.
const publishedPortalUrl = import.meta.env.VITE_PORTAL_URL || "https://portal.itinium.co.uk";

export function shareableSignInLink(portalUrl = publishedPortalUrl): string {
  const url = new URL(portalUrl);
  if (url.protocol !== "https:" || !url.hostname || url.username || url.password) {
    throw new Error("The published portal URL must be a credential-free HTTPS address");
  }
  return `${url.origin}/login`;
}