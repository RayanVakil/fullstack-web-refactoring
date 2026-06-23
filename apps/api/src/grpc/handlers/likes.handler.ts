import type { ILikesService } from "@chirp/proto";
import { validateSessionToken } from "../../middleware/auth";
import {
	getCommentLikeStatus,
	getPostLikeStatus,
	toggleCommentLike,
	togglePostLike,
} from "../../services/likes.service";

export const likesHandler: ILikesService = {
	async togglePostLike(request) {
		const auth = validateSessionToken(request.sessionToken);
		const result = await togglePostLike(request.postId, auth.userId);

		return {
			success: true,
			liked: result.liked,
		};
	},

	async toggleCommentLike(request) {
		const auth = validateSessionToken(request.sessionToken);
		const result = await toggleCommentLike(request.commentId, auth.userId);

		return {
			success: true,
			liked: result.liked,
		};
	},

	async getPostLikeStatus(request) {
		try {
			const auth = validateSessionToken(request.sessionToken);
			const result = await getPostLikeStatus(request.postId, auth.userId);

			return { liked: result.liked };
		} catch {
			return { liked: false };
		}
	},

	async getCommentLikeStatus(request) {
		try {
			const auth = validateSessionToken(request.sessionToken);
			const result = await getCommentLikeStatus(request.commentId, auth.userId);

			return { liked: result.liked };
		} catch {
			return { liked: false };
		}
	},
};
