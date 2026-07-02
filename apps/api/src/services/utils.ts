import { createHash } from "node:crypto";
import * as bcrypt from "bcryptjs";

/**
 * Generate a simple ID
 */
export function generateId(): string {
	return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Hash password using bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
	return bcrypt.hash(password, 10);
}

/**
 * Verify password against hash
 */
export async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
	// Check if it's a bcrypt hash
	if (hashedPassword.startsWith("$2a$") || hashedPassword.startsWith("$2b$")) {
		return bcrypt.compare(password, hashedPassword);
	}

	// Fallback to legacy SHA-256
	const hash = createHash("sha256");
	hash.update(`${password}salt`);
	const legacyHash = hash.digest("hex");
	return legacyHash === hashedPassword;
}

/**
 * Convert Date to protobuf Timestamp
 */
export function toProtoTimestamp(date: Date): { seconds: bigint; nanos: number } {
	const ms = date.getTime();
	return {
		seconds: BigInt(Math.floor(ms / 1000)),
		nanos: (ms % 1000) * 1000000,
	};
}

/**
 * Convert protobuf Timestamp to Date
 */
export function fromProtoTimestamp(timestamp: { seconds: bigint; nanos: number }): Date {
	return new Date(Number(timestamp.seconds) * 1000 + timestamp.nanos / 1000000);
}
