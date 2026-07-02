import { randomUUID } from "node:crypto";
import { RpcError } from "@protobuf-ts/runtime-rpc";

export class AppError extends Error {
	constructor(
		public code: string,
		message: string,
	) {
		super(message);
		this.name = "AppError";
	}
}

export function withLogging<T extends Record<string, any>>(serviceName: string, handler: T): T {
	const wrapped = {} as T;
	for (const key of Object.keys(handler)) {
		const method = handler[key];
		if (typeof method === "function") {
			wrapped[key as keyof T] = (async (request: any, context: any) => {
				const traceId = randomUUID();
				const startTime = Date.now();

				try {
					console.log(
						JSON.stringify({ traceId, service: serviceName, method: key, status: "STARTED" }),
					);
					const result = await method(request, context);
					const duration = Date.now() - startTime;

					// Add trace ID to response metadata so clients can correlate
					if (context && typeof context.responseTrailers === "object") {
						context.responseTrailers.traceId = traceId;
					}

					console.log(
						JSON.stringify({ traceId, service: serviceName, method: key, duration, status: "OK" }),
					);
					return result;
				} catch (error) {
					const duration = Date.now() - startTime;
					console.error(
						JSON.stringify({
							traceId,
							service: serviceName,
							method: key,
							duration,
							status: "ERROR",
							error: error instanceof Error ? error.message : "Unknown",
						}),
					);

					if (error instanceof AppError) {
						throw new RpcError(error.message, error.code);
					}

					if (error instanceof Error) {
						if (
							error.message.includes("Token expired") ||
							error.message.includes("Invalid token") ||
							error.message.includes("No session")
						) {
							throw new RpcError(error.message, "UNAUTHENTICATED");
						}
						if (error.message.includes("not found")) {
							throw new RpcError(error.message, "NOT_FOUND");
						}
						if (error.message.includes("Unauthorized") || error.message.includes("denied")) {
							throw new RpcError(error.message, "PERMISSION_DENIED");
						}
						if (error.message.includes("Invalid")) {
							throw new RpcError(error.message, "INVALID_ARGUMENT");
						}
					}

					throw new RpcError(
						error instanceof Error ? error.message : "Internal Server Error",
						"INTERNAL",
					);
				}
			}) as any;
		} else {
			wrapped[key as keyof T] = method;
		}
	}
	return wrapped;
}
