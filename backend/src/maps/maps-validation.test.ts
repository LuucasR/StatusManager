import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRegionSchema, detectImageType, updateRegionSchema } from "./maps-validation";

const sector = { x: 0.1, y: 0.2, w: 0.3, h: 0.4, title: "North wing" };

describe("createRegionSchema", () => {
  it("accepts a sector inside the image and fills the defaults", () => {
    const parsed = createRegionSchema.parse(sector);
    assert.equal(parsed.state, "PENDING");
    assert.deepEqual(parsed.assigneeIds, []);
    assert.equal(parsed.taskId, null);
  });

  it("accepts one dragged right up to the edge, with rounding", () => {
    assert.ok(createRegionSchema.safeParse({ ...sector, x: 0.7, w: 0.3000000001 }).success);
  });

  it("rejects one that runs off the image", () => {
    assert.ok(!createRegionSchema.safeParse({ ...sector, x: 0.8, w: 0.3 }).success);
    assert.ok(!createRegionSchema.safeParse({ ...sector, y: -0.1 }).success);
  });

  it("rejects a misclick-sized sector and an empty title", () => {
    assert.ok(!createRegionSchema.safeParse({ ...sector, w: 0.001 }).success);
    assert.ok(!createRegionSchema.safeParse({ ...sector, title: "  " }).success);
  });
});

describe("updateRegionSchema", () => {
  it("lets the text change alone, but not half a rectangle", () => {
    assert.ok(updateRegionSchema.safeParse({ title: "South" }).success);
    assert.ok(!updateRegionSchema.safeParse({ x: 0.5 }).success);
    assert.ok(updateRegionSchema.safeParse({ x: 0.5, y: 0.5, w: 0.5, h: 0.5 }).success);
    assert.ok(!updateRegionSchema.safeParse({ x: 0.6, y: 0.5, w: 0.5, h: 0.5 }).success);
  });
});

describe("detectImageType", () => {
  it("reads the type from the bytes, not from what the client claimed", () => {
    assert.equal(detectImageType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0])), "image/png");
    assert.equal(detectImageType(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), "image/jpeg");
    assert.equal(detectImageType(Buffer.from("RIFF\0\0\0\0WEBPVP8 ", "ascii")), "image/webp");
    assert.equal(detectImageType(Buffer.from("<svg></svg>")), null);
  });
});
