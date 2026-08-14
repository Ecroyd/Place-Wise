import { searchCriteriaSchema } from "@/src/schemas/criteria";
import type { LocationScore, SearchCriteria } from "@/src/types/domain";

export interface CriteriaParser { parse(text: string): Promise<SearchCriteria> }

function parseBudget(text:string) {
  const match=text.match(/(?:\u00a3\s*)?([0-9][0-9,.]*)\s*(million|m|thousand|k)\b/i);
  if(!match) return undefined;
  const amount=Number(match[1].replace(/,/g,""));
  if(!Number.isFinite(amount)||amount<=0) return undefined;
  const unit=match[2].toLowerCase();
  return Math.round(amount*(unit==="million"||unit==="m"?1_000_000:1_000));
}

export class DeterministicCriteriaParser implements CriteriaParser {
  async parse(text: string) {
    const lower = text.toLowerCase();
    const minuteMatch = lower.match(/(\d+)\s*min/);
    const criteria: SearchCriteria = {
      mode: lower.includes("job") || lower.includes("work area") ? "work" : "live",
      destinations: [{ id:"middleton-work", label:"Middleton", purpose:"My work", latitude:53.55, longitude:-2.2, journeysPerWeek:5, preferredMinutes:Number(minuteMatch?.[1] ?? 35), maximumMinutes:50, transportMode:"drive", weight:100, hardMaximum:false }],
      property: parseBudget(lower) ? {maximumBudget:parseBudget(lower),hardBudget:false} : undefined,
      lifestyle: [
        { key:"schools", weight:lower.includes("school") ? 90 : 50 },
        { key:"greenSpace", weight:lower.includes("rural") || lower.includes("countryside") ? 95 : 50 },
        { key:"rurality", weight:lower.includes("rural") ? 90 : 45 },
        { key:"amenities", weight:65 }, { key:"restaurants", weight:lower.includes("restaurant") ? 65 : 40 },
        { key:"lowCrime", weight:85 }, { key:"railAccess", weight:30 }, { key:"broadband", weight:55 },
      ],
    };
    return searchCriteriaSchema.parse(criteria) as SearchCriteria;
  }
}

export interface ResultExplainer { explain(criteria:SearchCriteria, results:LocationScore[]):Promise<string> }
export class DeterministicResultExplainer implements ResultExplainer {
  async explain(_:SearchCriteria, results:LocationScore[]) { const [first,second]=results; return `${first.town} ranks first because ${first.positives.slice(0,2).join(" and ")}. ${second?.town ?? "The next option"} offers a different balance but gives up ${first.town}'s strongest advantages.`; }
}
