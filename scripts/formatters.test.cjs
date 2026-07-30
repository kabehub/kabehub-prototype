const assert = require("node:assert/strict");
const { installTsLoader } = require("./testBootstrap.cjs");

installTsLoader();

const { formatDateTime, timeAgo } = require("../lib/formatters.ts");

const originalDateNow = Date.now;
const fixedNow = new Date(2026, 5, 15, 12, 0, 0).getTime();

try {
  Date.now = () => fixedNow;

  const isoBefore = (milliseconds) =>
    new Date(fixedNow - milliseconds).toISOString();

  assert.equal(timeAgo(isoBefore(59_999)), "今");
  assert.equal(timeAgo(isoBefore(59 * 60_000)), "59分前");
  assert.equal(timeAgo(isoBefore(60 * 60_000)), "1時間前");
  assert.equal(timeAgo(isoBefore(23 * 60 * 60_000)), "23時間前");
  assert.equal(timeAgo(isoBefore(24 * 60 * 60_000)), "1日前");
  assert.equal(timeAgo(isoBefore(29 * 24 * 60 * 60_000)), "29日前");

  const thirtyDaysAgo = isoBefore(30 * 24 * 60 * 60_000);
  const expectedDate = new Date(thirtyDaysAgo).toLocaleDateString("ja-JP", {
    month: "short",
    day: "numeric",
  });
  assert.equal(timeAgo(thirtyDaysAgo), expectedDate);
  assert.doesNotMatch(timeAgo(thirtyDaysAgo), /日前$/);
} finally {
  Date.now = originalDateNow;
}

const localDate = new Date(2026, 4, 6, 7, 36).toISOString();
assert.equal(formatDateTime(localDate), "2026/05/06 07:36");

console.log("formatters tests passed");
