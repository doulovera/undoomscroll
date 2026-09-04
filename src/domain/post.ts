/** A post already stored in the `New Posts` database. */
export interface StoredPost {
  readonly id: string
  readonly publishedAt: Date
}

/** A post as returned by FxTwitter. */
export type PostKind = "post" | "quote" | "reply" | "repost"

export interface PostMedia {
  readonly type: "image" | "video"
  readonly url: string
}

export interface TwitterPost {
  readonly id: string
  readonly url: string
  readonly text: string
  readonly createdAt: string
  readonly createdTimestamp: number
  readonly kind: PostKind
  readonly media: ReadonlyArray<PostMedia>
}
