import fs from "node:fs";
import crypto from "node:crypto";
import { resolveShard } from "./resolveShard.ts";

let adjectives = fs
  .readFileSync(process.cwd() + "/words/adjectives.txt")
  .toString()
  .split(/\r?\n/);
const nouns = fs
  .readFileSync(process.cwd() + "/words/nouns.txt")
  .toString()
  .split(/\r?\n/);
const randomElement = (array: string[]) =>
  array[Math.floor(Math.random() * array.length)];
const roomAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ";

export function makeRoomName(shard: number | undefined) {
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    const code = Array.from(
      { length: 4 },
      () => roomAlphabet[crypto.randomInt(roomAlphabet.length)],
    ).join("");
    if (!shard || resolveShard(code) === Number(shard)) {
      return code;
    }
  }
  throw new Error("Unable to generate a room code for this shard.");
}

export function makeUserName() {
  return `${capFirst(randomElement(adjectives))} ${capFirst(
    randomElement(nouns),
  )}`;
}

function capFirst(string: string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}
