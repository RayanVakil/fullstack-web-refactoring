import type { IAuthService } from "@chirp/proto";
import { validateSessionToken } from "../../middleware/auth";
import { getCurrentUser, loginUser, registerUser } from "../../services/auth.service";
import { toProtoTimestamp } from "../../services/utils";

export const authHandler: IAuthService = {
	async register(request) {
		const result = await registerUser({
			email: request.email,
			username: request.username,
			displayName: request.displayName,
			password: request.password,
		});

		return {
			success: true,
			userId: result.userId,
			sessionToken: result.sessionToken,
		};
	},

	async login(request) {
		const result = await loginUser({
			email: request.email,
			password: request.password,
		});

		return {
			success: true,
			userId: result.userId,
			sessionToken: result.sessionToken,
		};
	},

	async logout(_request) {
		// With JWT, logout is handled client-side by removing the token
		return { success: true };
	},

	async getCurrentUser(request) {
		const auth = validateSessionToken(request.sessionToken);
		const user = await getCurrentUser(auth.userId);

		return {
			id: user.id,
			email: user.email,
			username: user.username,
			displayName: user.displayName,
			avatarUrl: user.avatarUrl || undefined,
			bio: user.bio || undefined,
			role: user.role,
			createdAt: toProtoTimestamp(user.createdAt),
		};
	},

	async validateSession(request) {
		try {
			const auth = validateSessionToken(request.sessionToken);
			return {
				valid: true,
				userId: auth.userId,
				username: auth.username,
				role: auth.role,
			};
		} catch {
			return {
				valid: false,
				userId: "",
				username: "",
				role: "",
			};
		}
	},
};
