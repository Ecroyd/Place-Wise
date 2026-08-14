export type OptimisationMode = "live" | "work" | "business";
export type TransportMode = "drive" | "transit" | "walk" | "cycle" | "mixed";
export type PreferenceKey = "schools" | "greenSpace" | "rurality" | "amenities" | "restaurants" | "lowCrime" | "railAccess" | "motorwayAccess" | "broadband" | "healthcare" | "shopping" | "nightlife";
export interface Coordinates { latitude:number; longitude:number }
export interface DestinationConstraint extends Coordinates { id:string; label:string; purpose:string; journeysPerWeek:number; preferredMinutes?:number; maximumMinutes?:number; transportMode:TransportMode; weight:number; hardMaximum:boolean }
export interface LifestylePreference { key:PreferenceKey; weight:number; hardConstraint?:boolean; minimumAcceptableScore?:number }
export interface PropertyConstraints { maximumBudget?:number; hardBudget?:boolean; minimumBedrooms?:number; propertyTypes?:string[]; tenure?:"buy"|"rent"; minimumAreaSqm?:number; minimumGardenSqm?:number }
export interface WorkConstraints { minimumSalary?:number; role?:string; industries?:string[]; daysInOffice?:number; hybridPreference?:"remote"|"hybrid"|"office"; careerGrowthWeight?:number }
export interface SearchCriteria { mode:OptimisationMode; destinations:DestinationConstraint[]; lifestyle:LifestylePreference[]; property?:PropertyConstraints; work?:WorkConstraints }
export interface LocationCell extends Coordinates { h3Index:string; town:string; region:string; typicalHousePrice:number; scores:Record<PreferenceKey,number>; employmentDensity:number; dataQuality:number }
export interface DestinationResult { destinationId:string; minutes:number; weeklyMinutes:number; preferredDelta:number }
export interface LocationScore { h3Index:string; town:string; overallScore:number; components:{commute:number;schools:number;affordability:number;lifestyle:number;transport:number}; destinationResults:DestinationResult[]; positives:string[];compromises:string[];excludedReasons:string[];paretoEfficient:boolean; typicalHousePrice:number; cell:LocationCell }
