import { RpcError } from "@protobuf-ts/runtime-rpc";
import { randomUUID } from "crypto";

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
					console.log(`[${traceId}] [${serviceName}.${key}] Request received`);
					const result = await method(request, context);
					const duration = Date.now() - startTime;
					console.log(`[${traceId}] [${serviceName}.${key}] Completed in ${duration}ms`);
					return result;
				} catch (error) {
					const duration = Date.now() - startTime;
					console.error(`[${traceId}] [${serviceName}.${key}] Failed in ${duration}ms`, error);

					if (error instanceof AppError) {
						throw new RpcError(error.message, error.code);
					}

					if (error instanceof Error) {
						if (error.message.includes("Token expired") || error.message.includes("Invalid token") || error.message.includes("No session")) {
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
