import { createServerFn } from "@tanstack/react-start";
import { getGrpcClient, requireGrpcSessionToken } from "../../lib/grpc.server";

export const togglePostLike = createServerFn({ method: "POST" })
	.inputValidator((d: string) => d)
	.handler(async ({ data: postId }) => {
		const sessionToken = await requireGrpcSessionToken();
		const client = getGrpcClient();

		const { response } = await client.likes.togglePostLike({
			sessionToken,
			postId,
		});

		return { success: true, liked: response.liked };
	});

export const toggleCommentLike = createServerFn({ method: "POST" })
	.inputValidator((d: string) => d)
	.handler(async ({ data: commentId }) => {
		const sessionToken = await requireGrpcSessionToken();
		const client = getGrpcClient();

		const { response } = await client.likes.toggleCommentLike({
			sessionToken,
			commentId,
		});

		return { success: true, liked: response.liked };
	});

export const getPostLikeStatus = createServerFn()
	.inputValidator((d: string) => d)
	.handler(async ({ data: postId }) => {
		const sessionToken = await requireGrpcSessionToken();
		const client = getGrpcClient();

		const { response } = await client.likes.getPostLikeStatus({
			sessionToken,
			postId,
		});

		return { liked: response.liked };
	});

export const getCommentLikeStatus = createServerFn()
	.inputValidator((d: string) => d)
	.handler(async ({ data: commentId }) => {
		const sessionToken = await requireGrpcSessionToken();
		const client = getGrpcClient();

		const { response } = await client.likes.getCommentLikeStatus({
			sessionToken,
			commentId,
		});

		return { liked: response.liked };
	});
