import { describe, it, expect, vi } from "vitest";
import net from "net";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { isRetryableConnectionError, withConnectionRetry } from "@/lib/db-retry";
import { connectionRetry } from "@/lib/db";
import { logger } from "@/lib/logger";

/** The shape `@prisma/driver-adapter-utils` raises: message plus the mapped payload as `cause`. */
function driverAdapterError(payload: Record<string, unknown> & { kind: string }) {
    const message = typeof payload.message === "string" ? payload.message : payload.kind;
    return Object.assign(new Error(message), { name: "DriverAdapterError", cause: payload });
}

/** What Supavisor answers with when it cannot resolve the upstream database (#1143). */
const SUPAVISOR_NXDOMAIN = "Failed to connect to database: {:error, :nxdomain}";

const nxdomain = () =>
    driverAdapterError({
        kind: "postgres",
        code: "XX000",
        severity: "FATAL",
        message: SUPAVISOR_NXDOMAIN,
    });

/** What Prisma raises instead when it recognises the adapter error kind. */
function prismaKnownRequestError(code: string, message: string, adapterCause: Record<string, unknown>) {
    return Object.assign(new Error(message), {
        name: "PrismaClientKnownRequestError",
        code,
        meta: { driverAdapterError: { name: "DriverAdapterError", cause: adapterCause } },
    });
}

describe("isRetryableConnectionError", () => {
    it("retries the Supavisor connect failure reported in #1143", () => {
        expect(isRetryableConnectionError(nxdomain())).toBe(true);
    });

    it("retries adapter kinds raised before any statement is sent", () => {
        expect(isRetryableConnectionError(driverAdapterError({ kind: "DatabaseNotReachable", host: "db", port: 5432 }))).toBe(true);
        expect(isRetryableConnectionError(driverAdapterError({ kind: "TlsConnectionError", reason: "handshake failed" }))).toBe(true);
    });

    it("retries a failure to initialise the client", () => {
        expect(isRetryableConnectionError(Object.assign(new Error("Can't reach database server"), { name: "PrismaClientInitializationError" }))).toBe(true);
    });

    // Guards the safety argument for retrying mutations: these two failures drop a
    // connection that may already have carried a statement, so a retry could
    // duplicate a write. They must never become retryable.
    it("does not retry a connection lost mid-statement", () => {
        expect(isRetryableConnectionError(driverAdapterError({ kind: "ConnectionClosed" }))).toBe(false);
        expect(isRetryableConnectionError(driverAdapterError({ kind: "SocketTimeout" }))).toBe(false);
    });

    it("does not retry pool saturation", () => {
        expect(isRetryableConnectionError(driverAdapterError({ kind: "TooManyConnections", cause: "Max client connections reached" }))).toBe(false);
    });

    it("does not retry Supavisor's other FATALs", () => {
        expect(
            isRetryableConnectionError(
                driverAdapterError({ kind: "postgres", code: "XX000", severity: "FATAL", message: "Tenant or user not found" })
            )
        ).toBe(false);
    });

    it("does not retry ordinary query failures or non-errors", () => {
        expect(isRetryableConnectionError(Object.assign(new Error("Unique constraint failed"), { name: "PrismaClientKnownRequestError", code: "P2002" }))).toBe(false);
        expect(isRetryableConnectionError(new Error("boom"))).toBe(false);
        expect(isRetryableConnectionError(null)).toBe(false);
        expect(isRetryableConnectionError("a string")).toBe(false);
    });

    it("retries the unreachable-server error Prisma raises in place of the adapter's", () => {
        expect(
            isRetryableConnectionError(
                prismaKnownRequestError("P1001", "Can't reach database server at db:5432", {
                    kind: "DatabaseNotReachable",
                    host: "db",
                })
            )
        ).toBe(true);
    });

    it("does not retry an ambiguous failure Prisma re-wrapped as its own error", () => {
        expect(
            isRetryableConnectionError(
                prismaKnownRequestError("P2010", "Raw query failed", { kind: "ConnectionClosed" })
            )
        ).toBe(false);
    });

    it("finds a retryable error wrapped as another error's cause", () => {
        expect(isRetryableConnectionError(new Error("query failed", { cause: nxdomain() }))).toBe(true);
    });

    it("retries when Prisma re-wraps the adapter message into its own", () => {
        const wrapped = Object.assign(
            new Error(
                "Invalid `prisma.project.findMany()` invocation:\n\nFailed to connect to database: {:error, :nxdomain}"
            ),
            { name: "PrismaClientUnknownRequestError" }
        );
        expect(isRetryableConnectionError(wrapped)).toBe(true);
    });
});

describe("withConnectionRetry", () => {
    const context = { model: "Project", operation: "findMany" };

    it("returns the result without retrying when the query succeeds", async () => {
        const run = vi.fn().mockResolvedValue("ok");
        await expect(withConnectionRetry(run, context, [0, 0])).resolves.toBe("ok");
        expect(run).toHaveBeenCalledTimes(1);
    });

    it("succeeds on a retry after a transient connection failure", async () => {
        const run = vi.fn().mockRejectedValueOnce(nxdomain()).mockResolvedValue("ok");
        await expect(withConnectionRetry(run, context, [0, 0])).resolves.toBe("ok");
        expect(run).toHaveBeenCalledTimes(2);
    });

    it("rethrows the original error once the attempts are exhausted", async () => {
        const error = nxdomain();
        const run = vi.fn().mockRejectedValue(error);
        await expect(withConnectionRetry(run, context, [0, 0])).rejects.toBe(error);
        expect(run).toHaveBeenCalledTimes(3);
    });

    it("rethrows a non-retryable error immediately", async () => {
        const error = new Error("Unique constraint failed");
        const run = vi.fn().mockRejectedValue(error);
        await expect(withConnectionRetry(run, context, [0, 0])).rejects.toBe(error);
        expect(run).toHaveBeenCalledTimes(1);
    });
});

describe("the retry extension on a real client", () => {
    /**
     * A Postgres server that only ever answers the startup handshake with the
     * FATAL Supavisor sends when it cannot resolve the upstream host, which is
     * what #1143 reports.
     */
    function listenRefusingConnections(message: string) {
        const attempts: number[] = [];
        const server = net.createServer((socket) => {
            attempts.push(Date.now());
            socket.on("data", (chunk: Buffer) => {
                const isSslRequest = chunk.length === 8 && chunk.readInt32BE(4) === 80877103;
                if (isSslRequest) {
                    socket.write(Buffer.from("N", "ascii"));
                    return;
                }
                socket.end(fatalErrorResponse(message));
            });
            socket.on("error", () => {});
        });
        return { server, attempts };
    }

    /** Postgres wire-protocol ErrorResponse: 'E', length, then tagged fields. */
    function fatalErrorResponse(message: string): Buffer {
        const fields: [string, string][] = [
            ["S", "FATAL"],
            ["V", "FATAL"],
            ["C", "XX000"],
            ["M", message],
        ];
        const body = Buffer.concat([
            ...fields.map(([tag, value]) =>
                Buffer.concat([Buffer.from(tag, "ascii"), Buffer.from(value, "utf8"), Buffer.from([0])])
            ),
            Buffer.from([0]),
        ]);
        const packet = Buffer.alloc(5 + body.length);
        packet.write("E", 0, "ascii");
        packet.writeInt32BE(4 + body.length, 1);
        body.copy(packet, 5);
        return packet;
    }

    it("retries a query through a pooler that cannot reach the database (#1143)", async () => {
        const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
        const { server, attempts } = listenRefusingConnections(SUPAVISOR_NXDOMAIN);
        await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
        const { port } = server.address() as net.AddressInfo;

        const client = new PrismaClient({
            adapter: new PrismaPg({ connectionString: `postgresql://u:p@127.0.0.1:${port}/db` }),
        }).$extends(connectionRetry);

        try {
            await expect(client.project.findMany()).rejects.toThrow(/Failed to connect to database/);
            expect(attempts).toHaveLength(3);
            expect(warn).toHaveBeenCalledTimes(2);
            expect(warn.mock.calls[0][1]).toEqual({ model: "Project", operation: "findMany", attempt: 1, delayMs: 150 });
        } finally {
            warn.mockRestore();
            await client.$disconnect();
            await new Promise<void>((resolve) => server.close(() => resolve()));
        }
    });

    it("retries a query whose host cannot be resolved", async () => {
        const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
        const client = new PrismaClient({
            adapter: new PrismaPg({
                connectionString: "postgresql://u:p@db-1143.invalid:5432/db",
            }),
        }).$extends(connectionRetry);

        try {
            await expect(client.project.findMany()).rejects.toThrow();
            expect(warn).toHaveBeenCalledTimes(2);
            expect(warn.mock.calls[0][1]).toEqual({ model: "Project", operation: "findMany", attempt: 1, delayMs: 150 });
        } finally {
            warn.mockRestore();
            await client.$disconnect();
        }
    });

    /**
     * The exported `prisma` singleton, not a hand-extended client: this is the
     * only test that fails if `createPrismaClient` stops applying the extension.
     */
    it("retries through the client every route imports", async () => {
        const { server, attempts } = listenRefusingConnections(SUPAVISOR_NXDOMAIN);
        await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
        const { port } = server.address() as net.AddressInfo;

        // src/lib/db.ts caches the client on globalThis outside production, so the
        // module-scope import above would otherwise be handed back unchanged.
        const globalForPrisma = globalThis as unknown as { prisma?: unknown };
        const cachedClient = globalForPrisma.prisma;
        const databaseUrl = process.env.DATABASE_URL;
        delete globalForPrisma.prisma;
        process.env.DATABASE_URL = `postgresql://u:p@127.0.0.1:${port}/db`;
        vi.resetModules();

        let disconnect: (() => Promise<void>) | undefined;
        try {
            const { prisma } = await import("@/lib/db");
            disconnect = () => prisma.$disconnect();
            await expect(prisma.project.findMany()).rejects.toThrow(/Failed to connect to database/);
            expect(attempts).toHaveLength(3);
        } finally {
            await disconnect?.();
            globalForPrisma.prisma = cachedClient;
            process.env.DATABASE_URL = databaseUrl;
            vi.resetModules();
            await new Promise<void>((resolve) => server.close(() => resolve()));
        }
    });
});
