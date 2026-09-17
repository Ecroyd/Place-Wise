import type { LocationCell, LocationScore, SearchCriteria } from "@/src/types/domain";
import type { CachedRoutingProvider } from "@/src/lib/routing/cache";

const clamp=(value:number)=>Math.max(0,Math.min(100,value));

export async function optimise(criteria:SearchCriteria,cells:LocationCell[],routing:CachedRoutingProvider):Promise<LocationScore[]> {
 const results:LocationScore[]=[];
 for(const cell of cells){
  const excludedReasons:string[]=[];
  const destinationResults=[];
  let commutePenalty=0,totalJourneyWeight=0;
  for(const destination of criteria.destinations){
   const trip=await routing.get(cell.h3Index,destination.id,cell,destination,destination.transportMode,"weekday",destination.departureTime);
   const weekly=trip.minutes*destination.journeysPerWeek*2;
   const over=Math.max(0,trip.minutes-(destination.preferredMinutes??trip.minutes));
   const weight=Math.max(1,destination.journeysPerWeek)*destination.weight/100;
   commutePenalty+=(over*1.25+Math.max(0,over-10)*2.4)*weight;
   totalJourneyWeight+=weight;
   if(destination.hardMaximum&&destination.maximumMinutes&&trip.minutes>destination.maximumMinutes)excludedReasons.push(`${destination.label} exceeds the hard ${destination.maximumMinutes}-minute limit`);
   if(destination.minimumMinutes!==undefined&&trip.minutes<destination.minimumMinutes)excludedReasons.push(`${destination.label} is below your ${destination.minimumMinutes}-minute minimum`);
   if(destination.minimumDistanceKm!==undefined&&trip.distanceKm!==undefined&&trip.distanceKm<destination.minimumDistanceKm)excludedReasons.push(`${destination.label} is below your ${destination.minimumDistanceKm} km minimum distance`);
   if(destination.maximumDistanceKm&&trip.distanceKm&&trip.distanceKm>destination.maximumDistanceKm)excludedReasons.push(`${destination.label} is beyond your ${destination.maximumDistanceKm} km search distance`);
   destinationResults.push({destinationId:destination.id,minutes:trip.minutes,distanceKm:trip.distanceKm,weeklyMinutes:weekly,preferredDelta:trip.minutes-(destination.preferredMinutes??trip.minutes)});
  }
  const commute=clamp(100-commutePenalty/Math.max(1,totalJourneyWeight));
  const availablePreferences=criteria.lifestyle.filter(preference=>typeof cell.scores[preference.key]==="number");
  let weighted=0,total=0;
  for(const preference of availablePreferences){
   const score=cell.scores[preference.key]!;
   weighted+=score*preference.weight;total+=preference.weight;
   if(preference.hardConstraint&&preference.minimumAcceptableScore&&score<preference.minimumAcceptableScore)excludedReasons.push(`${preference.key} falls below your minimum`);
  }
  const lifestyle=total?weighted/total:0;
  const budget=criteria.property?.maximumBudget;
  let affordability=75;
  if(budget){const ratio=cell.typicalHousePrice/budget;affordability=ratio<=1?clamp(92-(1-ratio)*10):clamp(80-(ratio-1)*180);if(criteria.property?.hardBudget&&ratio>1)excludedReasons.push("Typical price exceeds your hard budget")}
  const schools=cell.scores.schools??0;
  const transportScores=[cell.scores.railAccess,cell.scores.motorwayAccess].filter((value):value is number=>typeof value==="number");
  const transport=transportScores.length?transportScores.reduce((sum,value)=>sum+value,0)/transportScores.length:0;
  const hasLifestyle=total>0;
  const overall=excludedReasons.length?0:clamp(hasLifestyle?commute*.45+lifestyle*.30+affordability*.25:commute*.65+affordability*.35);
  const positives:string[]=[];
  const compromises:string[]=[];
  if(commute>80)positives.push("comfortably inside your commute target");else compromises.push("a longer weekly commute");
  if(affordability>80)positives.push("the historical area average is within your budget");else compromises.push("the historical area average is above your budget");
  results.push({h3Index:cell.h3Index,town:cell.town,overallScore:Math.round(overall),components:{commute:Math.round(commute),schools,affordability:Math.round(affordability),lifestyle:Math.round(lifestyle),transport:Math.round(transport)},destinationResults,positives,compromises,excludedReasons,paretoEfficient:false,typicalHousePrice:cell.typicalHousePrice,cell});
 }
 const eligible=results.filter(result=>!result.excludedReasons.length);
 for(const result of eligible)result.paretoEfficient=!eligible.some(other=>other!==result&&other.components.commute>=result.components.commute&&other.components.affordability>=result.components.affordability&&(other.components.commute>result.components.commute||other.components.affordability>result.components.affordability));
 return results.sort((a,b)=>b.overallScore-a.overallScore);
}
