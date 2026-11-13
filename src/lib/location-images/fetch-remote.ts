import dns from "node:dns";
import https from "node:https";
import net from "node:net";
import type { LookupFunction } from "node:net";
import { ImageRejectedError, MAX_IMAGE_BYTES } from "@/lib/location-images/process";

const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 15_000;

const blocked = new net.BlockList();
for (const [prefix, bits] of [
    ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16],
    ["172.16.0.0", 12], ["192.168.0.0", 16], ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) {
    blocked.addSubnet(prefix, bits, "ipv4");
}
for (const [prefix, bits] of [["::", 128], ["::1", 128], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8]] as const) {
    blocked.addSubnet(prefix, bits, "ipv6");
}

/** True for addresses an MCP caller must not make the server reach: private, loopback, link-local, CGNAT, multicast. */
export function isBlockedAddress(ip: string): boolean {
    const family = net.isIPv4(ip) ? "ipv4" : net.isIPv6(ip) ? "ipv6" : null;
    if (!family) return true;
    if (family === "ipv6") {
        const mapped = ip.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
        if (mapped) return blocked.check(mapped[1], "ipv4");
    }
    return blocked.check(ip, family);
}

/**
 * The socket connects to whatever this lookup returns, so checking here (not in
 * a separate resolve) leaves no window for a DNS-rebinding swap.
 */
const guardedLookup: LookupFunction = (hostname, options, callback) => {
    dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
        if (err) return callback(err, "", 4);
        const list = addresses as dns.LookupAddress[];
        if (list.length === 0 || list.some((a) => isBlockedAddress(a.address))) {
            return callback(new ImageRejectedError("That address is not reachable"), "", 4);
        }
        if (options.all) return callback(null, list);
        callback(null, list[0].address, list[0].family);
    });
};

function parseHttpsUrl(raw: string): URL {
    let url: URL;
    try {
        url = new URL(raw);
    } catch {
        throw new ImageRejectedError("Invalid image URL");
    }
    if (url.protocol !== "https:") throw new ImageRejectedError("Image URL must use https");
    // Node skips `lookup` for IP-literal hosts, so those are checked here.
    const host = url.hostname.replace(/^\[|\]$/g, "");
    if (net.isIP(host) && isBlockedAddress(host)) throw new ImageRejectedError("That address is not reachable");
    return url;
}

function getOnce(url: URL, signal: AbortSignal): Promise<{ redirect: string } | { body: Buffer }> {
    return new Promise((resolve, reject) => {
        const req = https.get(url, { lookup: guardedLookup, signal, headers: { accept: "image/*" } }, (res) => {
            const status = res.statusCode ?? 0;
            if (status >= 300 && status < 400 && res.headers.location) {
                res.resume();
                return resolve({ redirect: new URL(res.headers.location, url).toString() });
            }
            if (status !== 200) {
                res.resume();
                return reject(new ImageRejectedError(`Image URL answered ${status}`));
            }
            const chunks: Buffer[] = [];
            let size = 0;
            res.on("data", (chunk: Buffer) => {
                size += chunk.length;
                if (size > MAX_IMAGE_BYTES) {
                    req.destroy(new ImageRejectedError("Image is larger than 20 MB"));
                    return;
                }
                chunks.push(chunk);
            });
            res.on("end", () => resolve({ body: Buffer.concat(chunks) }));
            res.on("error", reject);
        });
        req.on("error", reject);
    });
}

/** Downloads an image for add_location_image: https only, public addresses only, ≤ 20 MB, 15 s. */
export async function fetchRemoteImage(raw: string): Promise<Buffer> {
    let url = parseHttpsUrl(raw);
    const signal = AbortSignal.timeout(TIMEOUT_MS);
    try {
        for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
            const result = await getOnce(url, signal);
            if ("body" in result) return result.body;
            url = parseHttpsUrl(result.redirect);
        }
    } catch (e) {
        if (e instanceof ImageRejectedError) throw e;
        if (signal.aborted) throw new ImageRejectedError("Image download timed out");
        throw new ImageRejectedError("Could not download the image");
    }
    throw new ImageRejectedError("Too many redirects");
}
