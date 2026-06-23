import { desc, eq, like, or } from "drizzle-orm";
import { db, schema } from "../db";
import { buildPostSelect } from "./posts.service";

const { users, posts } = schema;

export async function searchPosts(query: string, userId?: string) {
	if (!query || query.trim().length === 0) {
		return [];
	}

	const searchPattern = `%${query}%`;

	return await db
		.select(buildPostSelect(userId))
		.from(posts)
		.leftJoin(users, eq(posts.authorId, users.id))
		.where(like(posts.content, searchPattern))
		.orderBy(desc(posts.createdAt))
		.limit(50);
}

export async function searchUsers(query: string) {
	if (!query || query.trim().length === 0) {
		return [];
	}

	const searchPattern = `%${query}%`;

	const result = await db
		.select({
			id: users.id,
			username: users.username,
			displayName: users.displayName,
			avatarUrl: users.avatarUrl,
			bio: users.bio,
		})
		.from(users)
		.where(or(like(users.username, searchPattern), like(users.displayName, searchPattern)))
		.limit(20);

	return result;
}
