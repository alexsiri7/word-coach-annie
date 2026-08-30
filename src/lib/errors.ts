/**
 * Typed domain errors for use in controllers and route handlers.
 * Route handlers should catch these to return appropriate HTTP status codes
 * instead of falling through to the generic 500 handler.
 */

export class NotFoundError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "NotFoundError";
    }
}

export class ConflictError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "ConflictError";
    }
}
