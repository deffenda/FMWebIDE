import assert from "node:assert/strict";
import test from "node:test";
import {
  buildBrowseRouteHref,
  parseBrowseLaunchModeToken,
  parseBrowseViewModeToken
} from "./browse-url-state.ts";

test("parseBrowseViewModeToken accepts valid values", () => {
  assert.equal(parseBrowseViewModeToken("form"), "form");
  assert.equal(parseBrowseViewModeToken("LIST"), "list");
  assert.equal(parseBrowseViewModeToken(" table "), "table");
});

test("parseBrowseViewModeToken rejects invalid values", () => {
  assert.equal(parseBrowseViewModeToken(""), null);
  assert.equal(parseBrowseViewModeToken("grid"), null);
  assert.equal(parseBrowseViewModeToken(null), null);
});

test("parseBrowseLaunchModeToken accepts valid values", () => {
  assert.equal(parseBrowseLaunchModeToken("browse"), "browse");
  assert.equal(parseBrowseLaunchModeToken("FIND"), "find");
  assert.equal(parseBrowseLaunchModeToken(" preview "), "preview");
});

test("parseBrowseLaunchModeToken rejects invalid values", () => {
  assert.equal(parseBrowseLaunchModeToken(""), null);
  assert.equal(parseBrowseLaunchModeToken("layout"), null);
  assert.equal(parseBrowseLaunchModeToken(undefined), null);
});

test("buildBrowseRouteHref preserves unrelated params and writes non-default mode/view", () => {
  const href = buildBrowseRouteHref("Asset Details", "foo=1&bar=2", {
    viewMode: "table",
    launchMode: "find"
  });
  assert.equal(
    href,
    "/layouts/Asset%20Details/browse?foo=1&bar=2&view=table&mode=find"
  );
});

test("buildBrowseRouteHref removes default mode/view params", () => {
  const href = buildBrowseRouteHref("Asset Details", "view=list&mode=find&foo=1", {
    viewMode: "form",
    launchMode: "browse"
  });
  assert.equal(href, "/layouts/Asset%20Details/browse?foo=1");
});

test("buildBrowseRouteHref handles empty layout route name", () => {
  const href = buildBrowseRouteHref("", "", {
    viewMode: "list",
    launchMode: "find"
  });
  assert.equal(href, "/layouts/default/browse?view=list&mode=find");
});

