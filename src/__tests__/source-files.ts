import { readdirSync } from "fs";
import { join } from "path";

/** Every file under `dir` that ships with the app, i.e. outside `__tests__` directories. */
export function shippedFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) return entry.name === "__tests__" ? [] : shippedFiles(path);
        return [path];
    });
}
