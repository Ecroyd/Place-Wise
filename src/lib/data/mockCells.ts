import type { LocationCell, PreferenceKey } from "@/src/types/domain";
const keys:PreferenceKey[]=["schools","greenSpace","rurality","amenities","restaurants","lowCrime","railAccess","motorwayAccess","broadband","healthcare","shopping","nightlife"];
const row=(h3Index:string,town:string,latitude:number,longitude:number,price:number,values:number[],employmentDensity=60):LocationCell=>({h3Index,town,latitude,longitude,region:"Greater Manchester",typicalHousePrice:price,scores:Object.fromEntries(keys.map((k,i)=>[k,values[i]])) as Record<PreferenceKey,number>,employmentDensity,dataQuality:78});
export const mockCells:LocationCell[]=[
row("891954ac63bffff","Saddleworth",53.55,-2.01,720000,[91,96,96,63,58,88,58,72,87,70,56,32],49),
row("891954a92c7ffff","Prestwich",53.53,-2.29,540000,[86,75,28,91,92,73,88,89,92,88,91,85],82),
row("891954ad34fffff","Ramsbottom",53.65,-2.32,475000,[82,91,84,72,70,84,67,86,89,72,69,41],58),
row("891954a9633ffff","Didsbury",53.42,-2.23,685000,[94,77,24,96,95,81,91,72,94,92,94,89],88),
row("891954ac10fffff","Altrincham",53.39,-2.35,760000,[96,74,31,90,88,87,93,81,95,91,93,76],86),
row("891954a98a3ffff","Chorlton",53.44,-2.28,585000,[88,78,26,94,96,77,84,68,93,86,90,91],84),
row("891954ad507ffff","Marple",53.39,-2.06,510000,[87,92,80,68,60,86,73,55,90,70,65,35],55),
row("891954a840fffff","Middleton",53.55,-2.20,285000,[62,60,31,70,64,58,61,91,82,74,73,58],72),
row("891954a9117ffff","Sale",53.42,-2.32,520000,[89,73,22,86,82,84,90,75,94,89,90,70],79),
row("891954ad6d7ffff","Glossop",53.44,-1.95,365000,[78,94,91,65,58,82,64,46,85,67,62,31],47),
row("891954a89cfffff","Salford Quays",53.47,-2.29,330000,[66,48,8,93,90,61,91,76,96,86,91,93],95),
row("891954a8db7ffff","Manchester Centre",53.48,-2.24,345000,[65,35,2,99,99,54,98,72,97,96,99,99],100)
];
