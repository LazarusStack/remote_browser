// URL normalization utility
export const normalizeUrl = (input) => {
  if (!input || !input.trim()) return input;

  const trimmed = input.trim();

  // Check if it's already a valid URL with protocol
  try {
    const url = new URL(trimmed);
    return url.href;
  } catch (e) {
    // Not a valid URL with protocol
  }

  // Check if it looks like a domain (contains dots or localhost, and no spaces)
  const hasNoSpaces = !trimmed.includes(' ');
  const hasDot = trimmed.includes('.');
  const isLocalhost = trimmed.toLowerCase().startsWith('localhost');
  const hasColonPort = /:\d+/.test(trimmed); // e.g., localhost:3000

  // Simple check: if it has a dot or is localhost, and no spaces, treat as URL
  if ((hasDot || isLocalhost) && hasNoSpaces) {
    // It's likely a domain, add https://
    let normalized = trimmed;

    // Don't add www. for localhost or IP addresses
    const isIP = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(trimmed);
    const isLocal = isLocalhost || normalized.startsWith('127.') || normalized.startsWith('192.') || normalized.startsWith('10.');

    if (!isLocal && !normalized.startsWith('www.') && !normalized.includes('://')) {
      // Check if it's a common TLD that typically uses www
      const commonTlds = ['.com', '.org', '.net', '.edu', '.gov', '.io', '.co', '.dev', '.app'];
      const hasCommonTld = commonTlds.some(tld => normalized.toLowerCase().includes(tld));
      if (hasCommonTld) {
        normalized = 'www.' + normalized;
      }
    }

    // Use http:// for localhost, https:// for others
    const protocol = (isLocalhost || isIP || isLocal) ? 'http://' : 'https://';
    return `${protocol}${normalized}`;
  }

  // If it contains spaces or doesn't look like a URL, treat as Google search
  return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
};
