import { desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "../db";
import { buildPostSelect } from "./posts.service";

const { users, posts, follows } = schema;

interface FeedOptions {
	limit?: number;
	offset?: number;
	userId?: string;
}

export async function getHomeFeed(userId: string, options: FeedOptions = {}) {
	const limit = options.limit || 20;
	const offset = options.offset || 0;

	// Get users that the current user follows
	const following = await db
		.select({ followingId: follows.followingId })
		.from(follows)
		.where(eq(follows.followerId, userId));

	const followingIds = following.map((f) => f.followingId);

	// Include the user's own posts as well
	const userIds = [...followingIds, userId];

	if (userIds.length === 0) {
		return [];
	}

	return await db
		.select(buildPostSelect(userId))
		.from(posts)
		.leftJoin(users, eq(posts.authorId, users.id))
		.where(inArray(posts.authorId, userIds))
		.orderBy(desc(posts.createdAt))
		.limit(limit)
		.offset(offset);
}

export async function getExploreFeed(options: FeedOptions = {}) {
	const limit = options.limit || 20;
	const offset = options.offset || 0;

	return await db
		.select(buildPostSelect(options.userId))
		.from(posts)
		.leftJoin(users, eq(posts.authorId, users.id))
		.orderBy(desc(posts.createdAt))
		.limit(limit)
		.offset(offset);
}
