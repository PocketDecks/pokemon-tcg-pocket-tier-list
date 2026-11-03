const test = require("node:test");
const assert = require("node:assert/strict");
const { previousExpansionDate } = require("../deck-archive-policy.mjs");

test("previous expansion date is the set released before the newest listed set", () => {
  assert.equal(previousExpansionDate(), "2026-08-27");
});

test("previous expansion date ignores deluxe sets and unsorted input", () => {
  const list = [
    { id: "c1", release_date: "2026-10-29" },
    { id: "b4b", release_date: "2026-09-30" },
    { id: "a1", release_date: "2024-10-30" },
    { id: "b4a", release_date: "2026-08-27" },
    { id: "pa", release_date: null },
  ];
  assert.equal(previousExpansionDate(list), "2026-08-27");
});
