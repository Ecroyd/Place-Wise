const ONS_BOUNDARIES =
  "https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/Local_Authority_Districts_December_2024_Boundaries_UK_BGC/FeatureServer/0/query";

const BOROUGHS = [
  "Bolton", "Bury", "Manchester", "Oldham", "Rochdale",
  "Salford", "Stockport", "Tameside", "Trafford", "Wigan",
];

export async function GET() {
  const url = new URL(ONS_BOUNDARIES);
  url.searchParams.set("where", `LAD24NM IN (${BOROUGHS.map(name => `'${name}'`).join(",")})`);
  url.searchParams.set("outFields", "LAD24NM");
  url.searchParams.set("outSR", "4326");
  url.searchParams.set("f", "geojson");

  try {
    const response = await fetch(url, { next: { revalidate: 60 * 60 * 24 * 30 } });
    if (!response.ok) throw new Error(`ONS returned ${response.status}`);
    const data = await response.json() as {
      type?: string;
      features?: { properties?: { LAD24NM?: string } }[];
      error?: { message?: string };
    };
    if (data.type !== "FeatureCollection" || data.features?.length !== BOROUGHS.length) {
      throw new Error(data.error?.message ?? "Incomplete ONS boundary data");
    }
    return Response.json(data, { headers: { "Cache-Control": "public, max-age=86400" } });
  } catch {
    return Response.json({ error: "Borough boundaries are temporarily unavailable" }, { status: 502 });
  }
}
