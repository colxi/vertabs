export function faviconUrl(url: string): string {
  try {
    const { host } = new URL(url);
    return `https://${host}/favicon.ico`;
  } catch {
    return "";
  }
}
