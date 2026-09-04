/** A Twitter account row in the `Accounts to check` database. */
export interface Account {
  readonly pageId: string
  readonly pageUrl: string
  readonly handle: string
}

export const normalizeTwitterHandle = (value: string): string => {
  const trimmed = value.trim()
  if (trimmed.startsWith("@")) return trimmed.slice(1)

  try {
    const url = new URL(trimmed)
    if (["x.com", "www.x.com", "twitter.com", "www.twitter.com"].includes(url.hostname)) {
      return url.pathname.split("/").filter(Boolean)[0] ?? ""
    }
  } catch {
    // Plain handles are expected most of the time.
  }

  return trimmed
}
