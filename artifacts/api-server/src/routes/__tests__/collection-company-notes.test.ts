import { describe, expect, it } from "vitest";
import { jobsTable } from "@workspace/db/schema";
import { collectorJobSelection } from "../collection-companies";

describe("collection-company job payload", () => {
  it("selects requester notes for the restricted transport view", () => {
    expect(collectorJobSelection.notes).toBe(jobsTable.notes);
  });
});