import { describe, it, expect } from "vitest";
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
});
