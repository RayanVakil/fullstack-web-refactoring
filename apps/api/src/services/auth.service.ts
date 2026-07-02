import { eq } from "drizzle-orm";
import { db, schema } from "../db";
import { AppError } from "../grpc/interceptor";
import { type AuthContext, createSessionToken } from "../middleware/auth";
import { generateId, hashPassword, verifyPassword } from "./utils";

const { users } = schema;

export interface RegisterInput {
	email: string;
	username: string;
	displayName: string;
	password: string;
}

export interface LoginInput {
	email: string;
	password: string;
}

export async function registerUser(input: RegisterInput) {
	// Check if email already exists
	const existingEmail = await db.select().from(users).where(eq(users.email, input.email)).get();

	if (existingEmail) {
		throw new AppError("INVALID_ARGUMENT", "User with this email already exists");
	}

	// Check if username already exists
	const existingUsername = await db
		.select()
		.from(users)
		.where(eq(users.username, input.username))
		.get();

	if (existingUsername) {
		throw new AppError("INVALID_ARGUMENT", "Username already taken");
	}

	// Hash password
	const passwordHash = await hashPassword(input.password);

	// Create user
	const userId = generateId();
	await db.insert(users).values({
		id: userId,
		email: input.email,
		username: input.username,
		displayName: input.displayName,
		passwordHash,
		role: "user",
	});

	// Create session token
	const sessionToken = createSessionToken({
		userId,
		username: input.username,
		role: "user",
	});

	return { userId, sessionToken };
}

export async function loginUser(input: LoginInput) {
	// Find user by email
	const user = await db.select().from(users).where(eq(users.email, input.email)).get();

	if (!user) {
		throw new AppError("UNAUTHENTICATED", "Invalid email or password");
	}

	// Check if user is banned
	if (user.bannedAt) {
		throw new AppError(
			"PERMISSION_DENIED",
			`Account banned: ${user.bannedReason || "No reason provided"}`,
		);
	}

	// Verify password
	const valid = await verifyPassword(input.password, user.passwordHash);
	if (!valid) {
		throw new AppError("UNAUTHENTICATED", "Invalid email or password");
	}

	// Transparently upgrade legacy SHA-256 hashes to bcrypt on-the-fly.
	// This ensures strict backward compatibility with older database records
	// while incrementally hardening the database without requiring mass migration scripts.
	if (!user.passwordHash.startsWith("$2a$") && !user.passwordHash.startsWith("$2b$")) {
		const newHash = await hashPassword(input.password);
		await db.update(users).set({ passwordHash: newHash }).where(eq(users.id, user.id)).run();
	}

	// Create session token
	const sessionToken = createSessionToken({
		userId: user.id,
		username: user.username,
		role: user.role as AuthContext["role"],
	});

	return { userId: user.id, sessionToken };
}

export async function getCurrentUser(userId: string) {
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
		})
		.from(users)
		.where(eq(users.id, userId))
		.get();

	if (!user) {
		throw new AppError("NOT_FOUND", "User not found");
	}

	return user;
}
