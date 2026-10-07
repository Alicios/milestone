/** Resolve files from Vite's public directory for root and sub-path deployments. */
export function publicAsset(path: string) {
  return `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`
}
