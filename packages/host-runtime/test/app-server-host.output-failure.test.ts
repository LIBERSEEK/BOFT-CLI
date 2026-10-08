import { describe, expect, it, vi } from "vitest";
import { hostItemIdSchema, hostTurnIdSchema } from "@codexhost/shared-contracts";
import {
  createFixture,
  startExternalThread,
  startPiThread,
  startPiTurn,
  stopFixture,
  threadStatus,
  turnEvent,
} from "./app-server-host-fixture.js";

describe("AppServerHost output failure", () => {
  it("fails the Turn and keeps its Session when an Item changes type at completion", async () => {
    const fixture = createFixture();
    try {
      const threadId = await startPiThread(fixture);
      const turnId = hostTurnIdSchema.parse(await startPiTurn(fixture, threadId));
      const session = fixture.adapter.sessions[0];
      if (!session) throw new Error("Fake Pi Session was not opened");
      const close = vi.spyOn(session, "close");
      const itemId = hostItemIdSchema.parse("conflicting-item");
      session.emitEvent({
        type: "item.started",
        turnId,
        item: { type: "reasoning", itemId, text: "Thinking" },
      });
      session.emitEvent({
        type: "item.completed",
        turnId,
        snapshot: {
          item: { type: "agentMessage", itemId, text: "Done" },
          outcome: { status: "succeeded" },
        },
      });
      // A bad Item must not leave the Host running or let a later success hide the failure.
      session.succeedTurn();
      const completed = await fixture.collector.waitFor((message) =>
        turnEvent(message, "turn/completed", turnId),
      );
      expect(completed).toMatchObject({
        params: {
          turn: {
            status: "failed",
            error: { message: expect.stringContaining("Host Item changed type") },
          },
        },
      });
      await fixture.collector.waitFor((message) => threadStatus(message, threadId, "idle"));
      // A projector invariant failure ends the Turn and leaves the Session open.
      expect(close).not.toHaveBeenCalled();
      expect(
        fixture.collector.messages.filter((message) =>
          turnEvent(message, "turn/completed", turnId),
        ),
      ).toHaveLength(1);
      const again = hostTurnIdSchema.parse(await startPiTurn(fixture, threadId, 3));
      expect(fixture.adapter.sessions).toHaveLength(1);
      session.succeedTurn();
      expect(
        await fixture.collector.waitFor((message) => turnEvent(message, "turn/completed", again)),
      ).toMatchObject({
        params: { turn: { status: "completed" } },
      });
      const otherThread = await startExternalThread(fixture, "codexhost/pi-native", 4);
      const otherTurn = await startPiTurn(fixture, otherThread, 5);
      const otherSession = fixture.adapter.sessions[1];
      if (!otherSession) throw new Error("Other Pi Session was not opened");
      otherSession.succeedTurn();
      expect(
        await fixture.collector.waitFor((message) =>
          turnEvent(message, "turn/completed", otherTurn),
        ),
      ).toMatchObject({
        params: { turn: { status: "completed" } },
      });
    } finally {
      await stopFixture(fixture);
    }
  });
});
