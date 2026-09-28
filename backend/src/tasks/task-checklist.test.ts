import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { diffChecklist } from "./task-checklist";

/**
 * The checklist diff.
 *
 * Tested because its failure mode is silent: replacing the whole list on every
 * save compiles, passes a type check, and looks right in the form - it just
 * quietly unticks every box each time somebody edits the title. There is no
 * database here on purpose; the arithmetic is the part that can be wrong.
 */

const current = [{ id: 1 }, { id: 2 }, { id: 3 }];

describe("diffChecklist", () => {
  it("keeps existing rows as updates, so their tick survives the edit", () => {
    const diff = diffChecklist(current, [
      { id: 1, text: "clean the menu" },
      { id: 2, text: "clean the assets" },
      { id: 3, text: "clean the npcs" },
    ]);

    assert.deepEqual(diff.creates, []);
    assert.deepEqual(diff.deletedIds, []);
    assert.deepEqual(
      diff.updates.map((item) => item.id),
      [1, 2, 3]
    );
  });

  it("uses the array index as the position, so reordering needs no extra field", () => {
    const diff = diffChecklist(current, [
      { id: 3, text: "c" },
      { id: 1, text: "a" },
      { id: 2, text: "b" },
    ]);

    assert.deepEqual(diff.updates, [
      { id: 3, text: "c", position: 0, assigneeIds: [] },
      { id: 1, text: "a", position: 1, assigneeIds: [] },
      { id: 2, text: "b", position: 2, assigneeIds: [] },
    ]);
  });

  it("treats an entry with no id as new, and positions it where it sits", () => {
    const diff = diffChecklist(current, [
      { id: 1, text: "a" },
      { text: "brand new" },
      { id: 2, text: "b" },
      { id: 3, text: "c" },
    ]);

    assert.deepEqual(diff.creates, [{ text: "brand new", position: 1, assigneeIds: [] }]);
    assert.deepEqual(diff.deletedIds, []);
  });

  it("deletes the rows the payload dropped", () => {
    const diff = diffChecklist(current, [{ id: 2, text: "b" }]);

    assert.deepEqual(diff.deletedIds, [1, 3]);
    assert.deepEqual(diff.updates, [{ id: 2, text: "b", position: 0, assigneeIds: [] }]);
  });

  it("empties the list when the payload is empty", () => {
    const diff = diffChecklist(current, []);

    assert.deepEqual(diff.deletedIds, [1, 2, 3]);
    assert.deepEqual(diff.updates, []);
    assert.deepEqual(diff.creates, []);
  });

  /**
   * The id of another task's item, or of one somebody else deleted while this
   * form was open. Reported rather than swallowed: creating it as a new row
   * would answer 200 to a request the caller meant as an edit of a specific row.
   */
  it("reports an id the task does not own instead of creating it", () => {
    const diff = diffChecklist(current, [
      { id: 1, text: "a" },
      { id: 99, text: "someone else's" },
    ]);

    assert.deepEqual(diff.unknownIds, [99]);
  });

  it("says nothing is unknown when every id belongs to the task", () => {
    assert.deepEqual(diffChecklist(current, [{ id: 1, text: "a" }]).unknownIds, []);
  });

  /**
   * The route checks these against the task's participants. Collected here so it
   * can do that in one query instead of one per row.
   */
  it("collects the assignees the payload asks for, without repeats", () => {
    const diff = diffChecklist(current, [
      { id: 1, text: "a", assigneeIds: [7, 8] },
      { id: 2, text: "b", assigneeIds: [7] },
      { text: "c", assigneeIds: [9, 8] },
      { id: 3, text: "d" },
    ]);

    assert.deepEqual(diff.assigneeIds, [7, 8, 9]);
  });

  it("keeps several assignees per item, without repeats inside one item", () => {
    const diff = diffChecklist(current, [
      { id: 1, text: "a", assigneeIds: [7, 9, 7] },
      { text: "b", assigneeIds: [8, 9] },
    ]);

    assert.deepEqual(diff.updates[0]?.assigneeIds, [7, 9]);
    assert.deepEqual(diff.creates[0]?.assigneeIds, [8, 9]);
  });

  /**
   * The set is rewritten on every save, so an item whose assignees the user
   * cleared has to produce an explicit empty list. Treated as "leave alone",
   * the old assignment would come straight back.
   */
  it("turns cleared or absent assignees into an explicit empty list", () => {
    const diff = diffChecklist(current, [
      { id: 1, text: "a", assigneeIds: [] },
      { id: 2, text: "b" },
    ]);

    assert.deepEqual(
      diff.updates.map((item) => item.assigneeIds),
      [[], []]
    );
    assert.deepEqual(diff.assigneeIds, []);
  });
});
