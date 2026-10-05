const url = new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://gittoskill.vercel.app')
if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('NEXT_PUBLIC_SITE_URL must be an HTTP(S) URL without credentials.')
export const siteUrl = url.origin
