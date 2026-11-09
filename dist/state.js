import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
export async function readState(file) {
    try {
        return JSON.parse(await readFile(file, "utf8"));
    }
    catch (error) {
        if (error.code === "ENOENT")
            return {};
        throw error;
    }
}
export async function writeState(file, state) {
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
}
//# sourceMappingURL=state.js.map