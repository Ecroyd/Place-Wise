import type { LocationCell, PreferenceKey } from "@/src/types/domain";
import { getPlacewiseClient } from "@/src/lib/supabase/server";

type LocationRow = {
  h3_index:string; centre_lat:number; centre_lng:number; town:string; region:string;
  typical_house_price:number; data_quality_score:number | null;
  school_score:number | null; green_space_score:number | null; rurality_score:number | null;
  amenity_score:number | null; restaurant_score:number | null; crime_score:number | null;
  rail_access_score:number | null; motorway_access_score:number | null; broadband_score:number | null;
  healthcare_score:number | null; employment_density_score:number | null;
};

const scoreColumns: Record<PreferenceKey, keyof LocationRow | null> = {
  schools:"school_score", greenSpace:"green_space_score", rurality:"rurality_score",
  amenities:"amenity_score", restaurants:"restaurant_score", lowCrime:"crime_score",
  railAccess:"rail_access_score", motorwayAccess:"motorway_access_score", broadband:"broadband_score",
  healthcare:"healthcare_score", shopping:null, nightlife:null,
};

export async function listLocationCells():Promise<LocationCell[]> {
  const { data, error } = await getPlacewiseClient().from("location_cells").select("*").not("typical_house_price", "is", null);
  if (error) throw new Error("Unable to load live location data: " + error.message);
  return (data as LocationRow[]).map(row => {
    const scores = {} as Partial<Record<PreferenceKey,number>>;
    for (const [key,column] of Object.entries(scoreColumns) as [PreferenceKey,keyof LocationRow | null][]) {
      const value = column ? row[column] : null;
      if (typeof value === "number") scores[key] = value;
    }
    return {
      h3Index:row.h3_index, town:row.town, region:row.region,
      latitude:row.centre_lat, longitude:row.centre_lng,
      typicalHousePrice:row.typical_house_price, scores,
      employmentDensity:row.employment_density_score ?? 0,
      dataQuality:row.data_quality_score ?? 0,
    };
  });
}
