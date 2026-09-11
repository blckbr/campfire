export function isOfficialSupabaseOAuthAuthorizeUrl(
  rawUrl: string,
  configuredSupabaseUrl: string | undefined
): boolean {
  if (!configuredSupabaseUrl) return false;
  try {
    const target = new URL(rawUrl);
    const supabase = new URL(configuredSupabaseUrl);
    const targetPath = target.pathname.replace(/\/+$/, "");
    const supabaseBasePath = supabase.pathname.replace(/\/+$/, "");
    const expectedPath = `${supabaseBasePath}/auth/v1/authorize`.replace(/\/{2,}/g, "/");
    return target.origin === supabase.origin && targetPath === expectedPath;
  } catch {
    return false;
  }
}

export function shouldConfirmExternalUrl(
  rawUrl: string,
  confirmExternalLinks: boolean,
  configuredSupabaseUrl: string | undefined
): boolean {
  if (!confirmExternalLinks) return false;
  if (isOfficialSupabaseOAuthAuthorizeUrl(rawUrl, configuredSupabaseUrl)) return false;
  return true;
}
