import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { diffChecklist } from "./task-checklist";
import { taskEditEvents } from "./task-history";

/**
 * The history lines an edit produces. Pure, like the checklist diff it builds
 * on: a wrong line here is silent, the edit itself still works.
 */

const current = {
  title: "Menu",
  description: "Clean it",
  startsAt: new Date("2026-10-01T09:00:00Z"),
  endsAt: new Date("2026-10-01T13:00:00Z"),
  state: "PENDING" as const,
  checklist: [
    { id: 1, text: "clean the menu", assignees: [{ employeeId: 10 }] },
    { id: 2, text: "clean the assets", assignees: [{ employeeId: 11 }] },
  ],
};

describe("taskEditEvents", () => {
  it("writes nothing for a save that changed nothing", () => {
    const events = taskEditEvents({
      current,
      next: { title: "Menu", description: "Clean it", startsAt: current.startsAt, state: "PENDING" },
      added: [],
      removed: [],
      checklistDiff: diffChecklist(current.checklist, [
        { id: 1, text: "clean the menu", assigneeIds: [10] },
        { id: 2, text: "clean the assets", assigneeIds: [11] },
      ]),
    });
    assert.deepEqual(events, []);
  });

  it("names the edited fields and the new state in one line each", () => {
    const events = taskEditEvents({
      current,
      next: {
        title: "Main menu",
        endsAt: new Date("2026-10-01T15:00:00Z"),
        state: "IN_PROGRESS",
      },
      added: [],
      removed: [],
      checklistDiff: null,
    });
    assert.deepEqual(events, [
      { type: "EDITED", detail: "title,dates" },
      { type: "STATE_CHANGED", detail: "IN_PROGRESS" },
    ]);
  });

  it("tells who joined, who left, and every item change", () => {
    const events = taskEditEvents({
      current,
      next: {},
      added: [12],
      removed: [11],
      checklistDiff: diffChecklist(current.checklist, [
        { id: 1, text: "clean the main menu", assigneeIds: [12] },
        { text: "clean the npcs", assigneeIds: [12] },
      ]),
    });
    assert.deepEqual(events, [
      { type: "PARTICIPANT_ADDED", targetId: 12 },
      { type: "PARTICIPANT_REMOVED", targetId: 11 },
      { type: "ITEM_DELETED", itemText: "clean the assets" },
      { type: "ITEM_CREATED", itemText: "clean the npcs" },
      { type: "ITEM_ASSIGNED", itemText: "clean the npcs", targetId: 12 },
      { type: "ITEM_RENAMED", itemText: "clean the main menu", detail: "clean the menu" },
      { type: "ITEM_UNASSIGNED", itemText: "clean the main menu", targetId: 10 },
      { type: "ITEM_ASSIGNED", itemText: "clean the main menu", targetId: 12 },
    ]);
  });

  it("does not repeat a removal from the task as one unassignment per item", () => {
    const events = taskEditEvents({
      current,
      next: {},
      added: [],
      removed: [10],
      checklistDiff: diffChecklist(current.checklist, [
        { id: 1, text: "clean the menu", assigneeIds: [] },
        { id: 2, text: "clean the assets", assigneeIds: [11] },
      ]),
    });
    assert.deepEqual(events, [{ type: "PARTICIPANT_REMOVED", targetId: 10 }]);
  });
});
