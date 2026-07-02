import { desc, eq, sql } from "drizzle-orm";
import { db, schema } from "../db";
import { AppError } from "../grpc/interceptor";
import { processMentions } from "./mentions.service";
import { generateId } from "./utils";

const { users, posts } = schema;

export interface CreatePostInput {
	content: string;
	authorId: string;
}

export interface UpdatePostInput {
	postId: string;
	content: string;
	userId: string;
}

export interface GetPostsOptions {
	limit?: number;
	offset?: number;
	userId?: string; // For checking if liked
}

export function buildPostSelect(currentUserId?: string) {
	return {
		id: posts.id,
		content: posts.content,
		createdAt: posts.createdAt,
		updatedAt: posts.updatedAt,
		author: {
			id: users.id,
			username: users.username,
			displayName: users.displayName,
			avatarUrl: users.avatarUrl,
		},
		likeCount: sql<number>`(SELECT count(*) FROM likes WHERE post_id = ${posts.id})`.mapWith(
			Number,
		),
		commentCount: sql<number>`(SELECT count(*) FROM comments WHERE post_id = ${posts.id})`.mapWith(
			Number,
		),
		isLiked: currentUserId
			? sql<boolean>`EXISTS (SELECT 1 FROM likes WHERE post_id = ${posts.id} AND user_id = ${currentUserId})`.mapWith(
					Boolean,
				)
			: sql<boolean>`0`.mapWith(Boolean),
	};
}

export async function createPost(input: CreatePostInput) {
	if (!input.content || input.content.length === 0) {
		throw new AppError("INVALID_ARGUMENT", "Post content is required");
	}

	if (input.content.length > 280) {
		throw new AppError("INVALID_ARGUMENT", "Post content must be 280 characters or less");
	}

	const postId = generateId();
	await db.insert(posts).values({
		id: postId,
		content: input.content,
		authorId: input.authorId,
	});

	// Process mentions create notifications
	await processMentions(input.content, input.authorId, postId);

	return { postId };
}

export async function getPost(postId: string, userId?: string) {
	const post = await db
		.select(buildPostSelect(userId))
		.from(posts)
		.leftJoin(users, eq(posts.authorId, users.id))
		.where(eq(posts.id, postId))
		.get();

	if (!post) {
		throw new AppError("NOT_FOUND", "Post not found");
	}

	return post;
}

export async function updatePost(input: UpdatePostInput) {
	if (!input.content || input.content.length === 0) {
		throw new AppError("INVALID_ARGUMENT", "Post content is required");
	}

	if (input.content.length > 280) {
		throw new AppError("INVALID_ARGUMENT", "Post content must be 280 characters or less");
	}

	const post = await db.select().from(posts).where(eq(posts.id, input.postId)).get();

	if (!post) {
		throw new AppError("NOT_FOUND", "Post not found");
	}

	if (post.authorId !== input.userId) {
		throw new AppError("PERMISSION_DENIED", "You can only edit your own posts");
	}

	// Check edit window (5 minutes)
	const now = Date.now();
	const postTime = post.createdAt.getTime();
	if (now - postTime > 300000) {
		throw new AppError("INVALID_ARGUMENT", "Edit window has expired (5 minutes)");
	}

	await db
		.update(posts)
		.set({
			content: input.content,
			updatedAt: new Date(),
		})
		.where(eq(posts.id, input.postId));

	return { success: true };
}

export async function deletePost(postId: string, userId: string) {
	const post = await db.select().from(posts).where(eq(posts.id, postId)).get();

	if (!post) {
		throw new AppError("NOT_FOUND", "Post not found");
	}

	if (post.authorId !== userId) {
		throw new AppError("PERMISSION_DENIED", "You can only delete your own posts");
	}

	await db.delete(posts).where(eq(posts.id, postId));

	return { success: true };
}

export async function getPosts(options: GetPostsOptions = {}) {
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

export async function getUserPosts(username: string, userId?: string) {
	const user = await db.select().from(users).where(eq(users.username, username)).get();

	if (!user) {
		throw new AppError("NOT_FOUND", "User not found");
	}

	return await db
		.select(buildPostSelect(userId))
		.from(posts)
		.leftJoin(users, eq(posts.authorId, users.id))
		.where(eq(posts.authorId, user.id))
		.orderBy(desc(posts.createdAt));
}
