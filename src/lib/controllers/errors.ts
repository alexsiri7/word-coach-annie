/** An error whose message is written for the user, so API and MCP clients may see it verbatim. */
export class UserFacingError extends Error {}

export class NotFoundError extends UserFacingError {}
export class ForbiddenError extends UserFacingError {}

/** An upstream service failed; the message carries its detail for server logs only. */
export class UpstreamServiceError extends Error {}
