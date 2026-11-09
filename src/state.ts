import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export interface Session {
  accessToken: string;
  refreshToken: string;
  email: string;
}

export interface State {
  user?: Session;
  business?: Session;
}

export async function readState(file: string): Promise<State> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as State;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
}

export async function writeState(file: string, state: State): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
}
