import { describe, it, expect, vi, afterEach } from "vitest";
import https from "node:https";
import type { ClientRequest, IncomingMessage } from "node:http";
import { fetchRemoteImage, isBlockedAddress } from "@/lib/location-images/fetch-remote";

describe("isBlockedAddress", () => {
    it.each([
        "127.0.0.1", "10.1.2.3", "172.16.5.4", "192.168.1.1", "169.254.169.254", "100.64.0.1",
        "0.0.0.0", "224.0.0.1", "::", "::1", "fd00::1", "fe80::1", "ff02::1", "::ffff:127.0.0.1", "not-an-ip",
    ])("blocks %s", (ip) => {
        expect(isBlockedAddress(ip)).toBe(true);
    });

    it.each(["93.184.216.34", "8.8.8.8", "2606:2800::1", "::ffff:93.184.216.34"])("allows %s", (ip) => {
        expect(isBlockedAddress(ip)).toBe(false);
    });
});

describe("fetchRemoteImage", () => {
    it.each([
        ["http://example.com/a.png", "Image URL must use https"],
        ["file:///etc/passwd", "Image URL must use https"],
        ["not a url", "Invalid image URL"],
        ["https://127.0.0.1/a.png", "That address is not reachable"],
        ["https://[::1]/a.png", "That address is not reachable"],
        ["https://169.254.169.254/latest/meta-data", "That address is not reachable"],
    ])("refuses %s without connecting", async (url, message) => {
        await expect(fetchRemoteImage(url)).rejects.toThrow(message);
    });

    it("refuses a hostname that resolves to a private address", async () => {
        await expect(fetchRemoteImage("https://localhost/a.png")).rejects.toThrow("That address is not reachable");
    });

    describe("following a redirect", () => {
        afterEach(() => {
            vi.restoreAllMocks();
        });

        function redirectTo(location: string) {
            return vi.spyOn(https, "get").mockImplementation(((_url: URL, _options: unknown, callback: (res: IncomingMessage) => void) => {
                const res = { statusCode: 302, headers: { location }, resume: () => res } as unknown as IncomingMessage;
                queueMicrotask(() => callback(res));
                return { on: () => undefined, destroy: () => undefined } as unknown as ClientRequest;
            }) as unknown as typeof https.get);
        }

        it.each([
            ["https://169.254.169.254/latest/meta-data", "That address is not reachable"],
            ["https://[::1]/a.png", "That address is not reachable"],
            ["http://example.com/a.png", "Image URL must use https"],
        ])("re-checks the target %s before connecting to it", async (location, message) => {
            const get = redirectTo(location);
            await expect(fetchRemoteImage("https://images.example.com/a.png")).rejects.toThrow(message);
            expect(get).toHaveBeenCalledTimes(1);
        });
    });
});
