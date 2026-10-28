"use client";

import { setNonce } from "get-nonce";
import { getCspNonce } from "@/lib/csp-nonce";

// react-remove-scroll injects its scroll-lock <style> (used by Radix Dialog, AlertDialog,
// Popover, Select and DropdownMenu) with the nonce get-nonce hands it.
if (typeof document !== "undefined") {
    const nonce = getCspNonce();
    if (nonce) setNonce(nonce);
}

export function CspNonce() {
    return null;
}
