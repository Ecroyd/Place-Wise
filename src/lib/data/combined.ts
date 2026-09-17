import type {DestinationConstraint} from '@/src/types/domain';
import {withinTravelTime} from '@/src/lib/routing/commute';
export function routeFits(route:{minutes:number;distanceKm?:number}|null,destination:DestinationConstraint){
 if(!route||!withinTravelTime(route.minutes,destination))return false;
 if(destination.minimumDistanceKm!==undefined||destination.maximumDistanceKm!==undefined){if(route.distanceKm===undefined)return false;if(route.distanceKm<(destination.minimumDistanceKm??0)||route.distanceKm>(destination.maximumDistanceKm??Infinity))return false;}
 return true;
}
export interface CombinedSchool {enabled:boolean;phase:string;rating:string;reportArea:string;maximumWalkMinutes:number}
export interface CombinedMatch {id:string;name:string;latitude:number;longitude:number;price:number;details:string[];journeys:{label:string;minutes:number;mode:string}[];school?:{name:string;minutes:number;url:string}}
