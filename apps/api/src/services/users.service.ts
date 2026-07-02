import { AppError } from "../grpc/interceptor";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "../db";

const { users } = schema;

export interface UpdateProfileInput {
	userId: string;
	displayName?: string;
	bio?: string;
	avatarUrl?: string;
}

export async function getUser(username: string, requesterId?: string) {
	const user = await db
		.select({
			id: users.id,
			email: users.email,
			username: users.username,
			displayName: users.displayName,
			avatarUrl: users.avatarUrl,
			bio: users.bio,
			role: users.role,
			createdAt: users.createdAt,
			followerCount:
				sql<number>`(SELECT count(*) FROM follows WHERE following_id = ${users.id})`.mapWith(
					Number,
				),
			followingCount:
				sql<number>`(SELECT count(*) FROM follows WHERE follower_id = ${users.id})`.mapWith(Number),
			postCount: sql<number>`(SELECT count(*) FROM posts WHERE author_id = ${users.id})`.mapWith(
				Number,
			),
			isFollowing: requesterId
				? sql<boolean>`EXISTS (SELECT 1 FROM follows WHERE follower_id = ${requesterId} AND following_id = ${users.id})`.mapWith(
						Boolean,
					)
				: sql<boolean>`0`.mapWith(Boolean),
		})
		.from(users)
		.where(eq(users.username, username))
		.get();

	if (!user) {
		throw new AppError("NOT_FOUND", "User not found");
	}

	return user;
}

export async function updateProfile(input: UpdateProfileInput) {
	const updateData: Record<string, string> = {};

	if (input.displayName !== undefined) {
		updateData.displayName = input.displayName;
	}

	if (input.bio !== undefined) {
		updateData.bio = input.bio;
	}

	if (input.avatarUrl !== undefined) {
		updateData.avatarUrl = input.avatarUrl;
	}

	if (Object.keys(updateData).length === 0) {
		return { success: true };
	}

	await db
		.update(users)
		.set({
			...updateData,
			updatedAt: new Date(),
		})
		.where(eq(users.id, input.userId));

	return { success: true };
}
