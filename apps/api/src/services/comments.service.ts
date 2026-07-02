import { AppError } from "../grpc/interceptor";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "../db";
import { processMentions } from "./mentions.service";
import { createNotification } from "./notifications.service";
import { generateId } from "./utils";

const { users, posts, comments } = schema;

export interface CreateCommentInput {
	postId: string;
	content: string;
	authorId: string;
	parentId?: string;
}

export function buildCommentSelect(currentUserId?: string) {
	return {
		id: comments.id,
		content: comments.content,
		createdAt: comments.createdAt,
		parentId: comments.parentId,
		author: {
			id: users.id,
			username: users.username,
			displayName: users.displayName,
			avatarUrl: users.avatarUrl,
		},
		likeCount: sql<number>`(SELECT count(*) FROM likes WHERE comment_id = ${comments.id})`.mapWith(
			Number,
		),
		isLiked: currentUserId
			? sql<boolean>`EXISTS (SELECT 1 FROM likes WHERE comment_id = ${comments.id} AND user_id = ${currentUserId})`.mapWith(
					Boolean,
				)
			: sql<boolean>`0`.mapWith(Boolean),
	};
}

export async function createComment(input: CreateCommentInput) {
	if (!input.content || input.content.length === 0) {
		throw new AppError("INVALID_ARGUMENT", "Comment content is required");
	}

	// Verify post exists
	const post = await db.select().from(posts).where(eq(posts.id, input.postId)).get();

	if (!post) {
		throw new AppError("NOT_FOUND", "Post not found");
	}

	// If parentId provided, verify parent comment exists
	if (input.parentId) {
		const parentComment = await db
			.select()
			.from(comments)
			.where(eq(comments.id, input.parentId))
			.get();

		if (!parentComment) {
			throw new AppError("NOT_FOUND", "Parent comment not found");
		}

		// Only allow one level of nesting
		if (parentComment.parentId) {
			throw new AppError("INVALID_ARGUMENT", "Cannot reply to a reply");
		}
	}

	const commentId = generateId();
	await db.insert(comments).values({
		id: commentId,
		content: input.content,
		postId: input.postId,
		authorId: input.authorId,
		parentId: input.parentId || null,
	});

	// Create notification for post author
	await createNotification({
		userId: post.authorId,
		type: "comment",
		actorId: input.authorId,
		postId: input.postId,
		commentId,
	});

	// Process mentions create notifications
	await processMentions(input.content, input.authorId, input.postId, commentId);

	return { commentId };
}

export async function getPostComments(postId: string, userId?: string) {
	// Fetch all comments replies for the post in a single query
	const allComments = await db
		.select(buildCommentSelect(userId))
		.from(comments)
		.leftJoin(users, eq(comments.authorId, users.id))
		.where(eq(comments.postId, postId));

	const topLevelComments = allComments.filter((c) => !c.parentId);
	const replies = allComments.filter((c) => c.parentId);

	type CommentType = (typeof allComments)[0];
	type CommentWithReplies = CommentType & { replies: CommentWithReplies[] };

	const replyMap = new Map<string, CommentWithReplies[]>();
	for (const reply of replies) {
		if (!reply.parentId) continue;
		if (!replyMap.has(reply.parentId)) {
			replyMap.set(reply.parentId, []);
		}
		replyMap.get(reply.parentId)?.push({ ...reply, replies: [] });
	}

	return topLevelComments.map(
		(comment): CommentWithReplies => ({
			...comment,
			replies: replyMap.get(comment.id) || [],
		}),
	);
}

export async function deleteComment(commentId: string, userId: string) {
	const comment = await db.select().from(comments).where(eq(comments.id, commentId)).get();

	if (!comment) {
		throw new AppError("NOT_FOUND", "Comment not found");
	}

	if (comment.authorId !== userId) {
		throw new AppError("PERMISSION_DENIED", "You can only delete your own comments");
	}

	await db.delete(comments).where(eq(comments.id, commentId));

	return { success: true };
}
