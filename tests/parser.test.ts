import {describe,expect,it} from "vitest";
import {DeterministicCriteriaParser} from "../src/lib/ai/parser";
import {searchCriteriaSchema} from "../src/schemas/criteria";

describe("AI parser boundary",()=>{
  it("returns schema-valid shared criteria",async()=>expect(searchCriteriaSchema.safeParse(await new DeterministicCriteriaParser().parse("Middleton schools and green space")).success).toBe(true));
  it("does not invent affordability data when no budget is supplied",async()=>expect((await new DeterministicCriteriaParser().parse("I need a good area")).property).toBeUndefined());
  it("extracts a budget for historical area affordability",async()=>expect((await new DeterministicCriteriaParser().parse("We have a £1 million budget")).property?.maximumBudget).toBe(1_000_000));
  it("handles missing optional inputs",async()=>expect((await new DeterministicCriteriaParser().parse("I need a place")).destinations.length).toBeGreaterThan(0));
});
