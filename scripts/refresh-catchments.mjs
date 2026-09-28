import fs from 'node:fs';
const sourceUrl='https://www.stockport.gov.uk/find-your-catchment-area';
const features=[];
for(const [layer,phase,category] of [['mv_primary_catchments','Primary','Catchment'],['mv_secondary_catchments','Secondary','Catchment'],['mv_catholic_primary_catchments','Primary','Catholic associated area'],['mv_catholic_secondary_catchments','Secondary','Catholic associated area']]){
  const url='https://spatial.stockport.gov.uk/geoserver/ows?'+new URLSearchParams({service:'WFS',version:'2.0.0',request:'GetFeature',typeNames:'education:'+layer,outputFormat:'application/json',srsName:'EPSG:4326',count:'5000'});
  const r=await fetch(url,{signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('Catchment download failed');const data=await r.json();
  if(!data.features?.length||data.numberMatched>data.features.length)throw Error('Incomplete catchment download');
  for(const f of data.features){if(!['Polygon','MultiPolygon'].includes(f.geometry?.type))throw Error('Unexpected catchment geometry');const p=f.properties;features.push({type:'Feature',geometry:f.geometry,properties:{id:layer+':'+p.ogc_fid,urn:String(p.urn??''),name:String(p.school_name??p.name).trim(),phase,category,council:'Stockport',sourceUrl}});}
}
fs.writeFileSync('src/data/catchments.json',JSON.stringify({type:'FeatureCollection',retrievedAt:new Date().toISOString().slice(0,10),coverage:'Stockport Council published primary and secondary catchments and Catholic associated areas only',sourceUrl,features}));
console.log('Saved',features.length,'published boundaries');
