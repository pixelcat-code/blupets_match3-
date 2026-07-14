import test from "node:test";
import assert from "node:assert/strict";

import { tournamentUrlForScreen } from "../src/util/tournament-route.js";

test("an active tournament room keeps its invite code in the browser URL", () => {
  assert.equal(tournamentUrlForScreen({
    screen: "tournament",
    pathname: "/",
    tournamentCode: " ab-12_cd ",
  }), "/t/AB12CD");
});

test("leaving a tournament removes its invite code from unrelated screens", () => {
  assert.equal(tournamentUrlForScreen({
    screen: "start",
    pathname: "/t/TESTCODE",
    tournamentCode: "TESTCODE",
  }), "/");
  assert.equal(tournamentUrlForScreen({
    screen: "leaderboard",
    pathname: "/t/TESTCODE",
    tournamentCode: "TESTCODE",
  }), "/#leaderboard");
});

test("ordinary screen routes keep their existing pathname", () => {
  assert.equal(tournamentUrlForScreen({
    screen: "profile",
    pathname: "/",
  }), "/#profile");
});
