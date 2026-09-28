"use client";

import { useId, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CombinedMatch } from "@/src/lib/data/combined";
import {useViewField,useSearchView} from './SearchView';
import { MapLayers } from "./MapLayers";
import type { Map as MapLibreMap, Popup, Marker } from "maplibre-gl";
import type { Coordinates, DestinationConstraint, JourneyStep, TransportMode } from "@/src/types/domain";
import { commuteGrid, sharedCommuteGrid, commuteColour, commuteLimits, gridCellAt, withinTravelTime, type CommuteSample } from "@/src/lib/routing/commute";

import {overviewSamples,DETAIL_ROUTE_BUDGET} from '@/src/lib/routing/sampling';
import { commuteDetailGrid } from "@/src/lib/routing/detail";

const modeLabel = (mode?: TransportMode) => mode ? ({any:"Any travel mode",drive:"Driving",transit:"Public transport",mixed:"Public transport",walk:"Walking",cycle:"Cycling"})[mode] : "";

function useCompactMapChrome(query = "(max-width: 900px)") {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const media = window.matchMedia(query);
    const sync = () => setCompact(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, [query]);
  return compact;
}

export function GoogleAreaMap({ destinations, selectedArea, onPointSelected, budget=500000, minimumBudget=0, onModeChange, combinedMatches=[] }: { destinations: DestinationConstraint[]; budget?:number; minimumBudget?:number; onModeChange?:(mode:TransportMode,index:number)=>void; combinedMatches?:CombinedMatch[]; selectedArea?: Coordinates & {minutes:number|null;selectedMode?:TransportMode}; onPointSelected?: (point:Coordinates)=>void }) {
  const {view,setView}=useSearchView();
  const initialView=useRef(view.viewport);
  const maskId = useId().replace(/:/g, "");
  const [detailPaths, setDetailPaths] = useState<{ id: string; d: string }[]>([]);
  const [detailSamples, setDetailSamples] = useState<CommuteSample[]>([]);
  const [detailStatus, setDetailStatus] = useState("");
  const [shading, setShading] = useViewField('shading');
  const visibleRef = useRef(true);
  const requestDetailRef=useRef<(() => void)|null>(null);
  const refreshOverviewRef=useRef<(() => void)|null>(null);
  const refreshDetailRef = useRef<(() => void) | null>(null);
  const pointCallback = useRef(onPointSelected);
  useEffect(() => { pointCallback.current = onPointSelected; }, [onPointSelected]);
  const compactChrome = useCompactMapChrome();
  const [mapInstance,setMapInstance] = useState<MapLibreMap|null>(null);
  const element = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<SVGGElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const fitAreaRef = useRef<(() => void) | null>(null);
  const focusRequested = useRef(false);
  const samplesRef = useRef<CommuteSample[]>([]);
  const [samples, setSamples] = useState<CommuteSample[]>([]);
  const [paths, setPaths] = useState<{ id: string; d: string }[]>([]);
  const [savedDestinationIndex,setDestinationIndex]=useViewField('destinationIndex');
  const destinationIndex=savedDestinationIndex??(destinations.length>1?-1:0);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [progress, setProgress] = useState({ done: 0, total: 0, missing: 0 });
  const [routeError, setRouteError] = useState<string>();
  const [retry, setRetry] = useState(0);
  const [visible, setVisible] = useViewField('visible');
  useEffect(() => { visibleRef.current = visible; refreshDetailRef.current?.();if(visible)refreshOverviewRef.current?.(); }, [visible]);
  const [selectedMode, setSelectedMode] = useState<TransportMode>();
  const [journey, setJourney] = useState<JourneyStep[]>([]);
  const [selected, setSelected] = useState<number | null>();
  const [expanded, setExpanded] = useState(false);
  const expandButton = useRef<HTMLButtonElement>(null);
  const [mobilePanel, setMobilePanel] = useState<"controls" | "layers" | "callout" | null>(null);
  const [desktopLayersOpen, setDesktopLayersOpen] = useState(false);
  const allDestinations = destinations.length>1 && (destinationIndex===-1 || destinationIndex>=destinations.length);
  const baseDestination = destinations[Math.max(0,Math.min(destinationIndex,destinations.length-1))];
  const destination = useMemo(()=>allDestinations?{...baseDestination,label:'All destinations',minimumMinutes:0,maximumMinutes:100,preferredMinutes:100}:baseDestination,[allDestinations,baseDestination]);
  const limits = destination ? commuteLimits(destination) : { minimum: 0, maximum: 60 };
  const controlsOpen = !compactChrome || mobilePanel === "controls";
  const calloutOpen = !compactChrome || mobilePanel === "callout";
  const layersOpen = compactChrome ? mobilePanel === "layers" : desktopLayersOpen;

  useLayoutEffect(() => {
    if (!expanded) return;
    const panel = element.current?.parentElement;
    if (!panel) return;
    const button = expandButton.current;
    const scrollX = window.scrollX, scrollY = window.scrollY;
    const body = document.body;
    const previous = { position: body.style.position, top: body.style.top, left: body.style.left, width: body.style.width, overflow: body.style.overflow };
    const oldRole = panel.getAttribute('role'), oldLabel = panel.getAttribute('aria-label');
    panel.classList.add('map-expanded');
    panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-label', 'Full-screen map');
    Object.assign(body.style, {position:'fixed',top:-scrollY+'px',left:-scrollX+'px',width:'100%',overflow:'hidden'});
    // Keep background controls out of keyboard and screen-reader navigation.
    const inactive: HTMLElement[] = [];
    let current: HTMLElement = panel;
    while (current.parentElement) {
      for (const sibling of current.parentElement.children) if (sibling !== current && sibling instanceof HTMLElement && !sibling.inert) { sibling.inert = true; inactive.push(sibling); }
      if (current.parentElement === body) break;
      current = current.parentElement;
    }
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setExpanded(false); }
      if (event.key !== 'Tab') return;
      const controls = [...panel.querySelectorAll<HTMLElement>('button, a[href], input, select, summary, [tabindex="0"]')].filter(el => el.getClientRects().length && !el.matches(':disabled'));
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', keydown);
    button?.focus(); mapRef.current?.resize();
    return () => {
      document.removeEventListener('keydown', keydown);
      inactive.forEach(el => { el.inert = false; });
      panel.classList.remove('map-expanded'); panel.removeAttribute('aria-modal');
      if (oldRole === null) panel.removeAttribute('role'); else panel.setAttribute('role',oldRole);
      if (oldLabel === null) panel.removeAttribute('aria-label'); else panel.setAttribute('aria-label',oldLabel);
      Object.assign(body.style, previous); window.scrollTo(scrollX, scrollY);
      mapRef.current?.resize(); button?.focus();
    };
  }, [expanded]);

  useEffect(() => {
    if (!destination) return;
    const controller = new AbortController();
    let detailController: AbortController | undefined;
    let detailTimer: ReturnType<typeof setTimeout> | undefined;
    let map: MapLibreMap | undefined;
    let popup: Popup | undefined;
    let userMoved = !!initialView.current;
    let lastAutoFit = 0;
    let fittedCount = 0;
    let autoFit: ((force?:boolean) => void) | undefined;
    let resizeObserver: ResizeObserver | undefined;
    focusRequested.current = false;
    async function setup() {
      try {
        const maplibre = await import("maplibre-gl");
        if (controller.signal.aborted || !element.current) return;
        setMapInstance(null); setStatus("loading"); setRouteError(undefined); setSamples([]); setSelected(undefined); setJourney([]); setSelectedMode(undefined);
        samplesRef.current = [];
        setDetailPaths([]); setDetailSamples([]); setDetailStatus("");
        const generated = allDestinations ? sharedCommuteGrid(destinations) : commuteGrid(baseDestination);
        let detailGrid = { ...generated, features: [] as typeof generated.features };
        let currentDetailSamples: CommuteSample[] = [];
        const detailCache = new Map<string, { sample: CommuteSample; expires: number }>();
        const targets=allDestinations?destinations:[baseDestination];
        const ids = overviewSamples(generated,targets);
        setProgress({ done: 0, total: ids.length, missing: 0 });
        map = new maplibre.Map({
          container: element.current, center: initialView.current?[initialView.current.longitude,initialView.current.latitude]:[destination.longitude, destination.latitude], zoom: initialView.current?.zoom??9,
          maxPitch: 0, pitchWithRotate: false,
          style: { version: 8,
            sources: { osm: { type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, attribution: "© OpenStreetMap contributors" } },
            layers: [{ id: "osm", type: "raster", source: "osm" }],
          },
        });
        mapRef.current = map;
        map.addControl(new maplibre.NavigationControl({ showCompass: false }), "top-right");
        const anchor = maplibre.MercatorCoordinate.fromLngLat([destination.longitude, destination.latitude]);
        const units = 65536;
        const basis = [anchor,
          new maplibre.MercatorCoordinate(anchor.x + 1 / units, anchor.y),
          new maplibre.MercatorCoordinate(anchor.x, anchor.y + 1 / units),
        ].map(point => point.toLngLat());
        const syncOverlay = () => {
          if (!map || !overlayRef.current || controller.signal.aborted) return;
          const [origin, x, y] = basis.map(point => map!.project(point));
          overlayRef.current.setAttribute("transform", `matrix(${x.x - origin.x} ${x.y - origin.y} ${y.x - origin.x} ${y.y - origin.y} ${origin.x} ${origin.y})`);
        };
        map.on("render", syncOverlay);
        const makePaths = (grid: typeof generated) => grid.features.map(feature => ({ id: feature.properties.id,
            d: feature.geometry.coordinates.map(ring => ring.map((position, index) => {
              const point = maplibre.MercatorCoordinate.fromLngLat([position[0], position[1]]);
              return `${index ? "L" : "M"}${((point.x - anchor.x) * units).toFixed(6)},${((point.y - anchor.y) * units).toFixed(6)}`;
            }).join(" ") + " Z").join(" "),
          }));

        const cancelDetail = () => {
          clearTimeout(detailTimer);
          detailController?.abort();
        };
        const scheduleDetail = () => {
          cancelDetail();
          if (!map || controller.signal.aborted) return;
          if (!visibleRef.current || map.getZoom() < 12) {
            detailGrid = { ...generated, features: [] };
            currentDetailSamples = [];
            setDetailPaths([]); setDetailSamples([]); setDetailStatus("");
            return;
          }
          // Automatic overview fitting must not repeatedly trigger paid detail checks.
          if (!userMoved && !focusRequested.current) return;
          setDetailStatus("Zoom detail is available on request; moving the map makes no new routing calls.");
        };
        refreshDetailRef.current = scheduleDetail;
        requestDetailRef.current=()=>{cancelDetail();if(map&&map.getZoom()>=12&&visibleRef.current){void loadDetail();}else setDetailStatus("Zoom in closer and enable the travel-time area first.");};
        async function loadDetail() {
          if (!map || controller.signal.aborted || !visibleRef.current) return;
          const bounds = map.getBounds();
          detailGrid = commuteDetailGrid(generated, { west: bounds.getWest(), east: bounds.getEast(), south: bounds.getSouth(), north: bounds.getNorth() }, map.getZoom());
          const detailIds = overviewSamples(detailGrid,targets,DETAIL_ROUTE_BUDGET);
          const chosen=new Set(detailIds);detailGrid={...detailGrid,features:detailGrid.features.filter(f=>chosen.has(f.properties.id))};
          const active = new AbortController();
          detailController = active;
          currentDetailSamples = detailIds.flatMap(id => {
            const hit = detailCache.get(id);
            return hit && hit.expires > Date.now() ? [hit.sample] : [];
          });
          setDetailPaths(makePaths(detailGrid));
          setDetailSamples([...currentDetailSamples]);
          const cached = new Set(currentDetailSamples.map(sample => sample.id));
          const missing = detailIds.filter(id => !cached.has(id));
          const updateStatus = () => setDetailStatus(detailIds.length ? "Zoom detail: " + currentDetailSamples.length + " / " + detailIds.length + " checked" : "");
          updateStatus();
          try {
            for (let offset = 0; offset < missing.length; offset += 16) {
              if (active.signal.aborted || controller.signal.aborted) return;
              const response = await fetch("/api/commute", { method: "POST", signal: active.signal,
                headers: { "Content-Type": "application/json" }, body: JSON.stringify({ destination: baseDestination, destinations: allDestinations ? destinations : undefined, cells: missing.slice(offset, offset + 16) }),
              });
              const payload = await response.json() as { samples?: CommuteSample[]; error?: string };
              if (!response.ok || !payload.samples) throw new Error(payload.error ?? "Detail could not load.");
              if (active.signal.aborted || controller.signal.aborted) return;
              for (const sample of payload.samples) {
                if (detailCache.size >= 2048) detailCache.delete(detailCache.keys().next().value!);
                detailCache.set(sample.id, { sample, expires: Date.now() + 5 * 60 * 1000 });
              }
              currentDetailSamples.push(...payload.samples);
              setDetailSamples([...currentDetailSamples]); updateStatus();
            }
          } catch (error) {
            if (!active.signal.aborted && !controller.signal.aborted) setDetailStatus(error instanceof Error ? error.message : "Detail could not load. Pan or zoom to retry.");
          }
        }
        map.on("movestart", cancelDetail);
        map.on("moveend", scheduleDetail);
        map.on("moveend",()=>{if(!map||controller.signal.aborted)return;const centre=map.getCenter();setView(old=>({...old,viewport:{latitude:centre.lat,longitude:centre.lng,zoom:map!.getZoom()}}));});
        map.on("load", () => {
          if (!map || controller.signal.aborted) return;
          setPaths(makePaths(generated));
          const fitArea = (duration = 600) => {
            if (!map || controller.signal.aborted) return;
            const times = new Map(samplesRef.current.map(sample => [sample.id, sample.minutes]));
            const reachable = generated.features.filter(feature => withinTravelTime(times.get(feature.properties.id), destination));
            const bounds = new maplibre.LngLatBounds();
            for (const target of allDestinations ? destinations : [destination]) bounds.extend([target.longitude, target.latitude]);
            for (const feature of reachable.length ? reachable : generated.features) {
              for (const point of feature.geometry.coordinates[0]) bounds.extend([point[0], point[1]]);
            }
            const height = map.getContainer().clientHeight;
            const width = map.getContainer().clientWidth;
            const compact = width <= 900;
            map.stop();
            map.fitBounds(bounds, {padding:compact
              ? {top:Math.min(72,height*.12),bottom:Math.min(88,height*.14),left:Math.min(28,width*.06),right:Math.min(28,width*.06)}
              : {top:Math.min(265,height*.27),bottom:Math.min(275,height*.27),left:Math.min(90,width*.14),right:Math.min(90,width*.14)},maxZoom:12,duration}, {commuteAutoFit:true});
          };
          fitAreaRef.current = () => { userMoved = false; focusRequested.current = false; fitArea(); };
          autoFit = (force = false) => {
            if (userMoved || focusRequested.current || controller.signal.aborted) return;
            const count = samplesRef.current.filter(sample => withinTravelTime(sample.minutes, destination)).length;
            if (!count || (!force && (count === fittedCount || Date.now() - lastAutoFit < 2000))) return;
            lastAutoFit = Date.now(); fittedCount = count;
            fitArea(450);
          };
          if(!initialView.current)fitArea(0);
          let previousSize = '';
          resizeObserver = new ResizeObserver(() => {
            if (!map || controller.signal.aborted) return;
            const size = map.getContainer().clientWidth + ':' + map.getContainer().clientHeight;
            if (size === previousSize) return;
            previousSize = size; map.resize();
            if (!userMoved && !focusRequested.current) fitArea(0);
          });
          resizeObserver.observe(map.getContainer());
          for (const [index,target] of (allDestinations ? destinations : [destination]).entries()) {
            const pin = document.createElement("div");
            pin.className = "commute-destination-pin";
            pin.title = `Destination ${index+1}: ${target.label}`;
            pin.setAttribute("aria-label", pin.title);
            if(allDestinations)pin.textContent=String(index+1);
            new maplibre.Marker({ element: pin }).setLngLat([target.longitude, target.latitude]).addTo(map);
          }
          syncOverlay(); setMapInstance(map); setStatus("ready");
          const collapsePanels = () => { if (window.matchMedia('(max-width: 900px)').matches) { setMobilePanel(null); setDesktopLayersOpen(false); } };
          map.on("dragstart", event => { if (event.originalEvent) { userMoved = true; collapsePanels(); } });
          map.on("zoomstart", event => { if (!(event as unknown as {commuteAutoFit?:boolean}).commuteAutoFit) { userMoved = true; collapsePanels(); } });
          map.on("click", event => {
            pointCallback.current?.({latitude:event.lngLat.lat,longitude:event.lngLat.lng});
            const point = { latitude: event.lngLat.lat, longitude: event.lngLat.lng };
            const detailCell = gridCellAt(detailGrid, point);
            const cell = detailCell ?? gridCellAt(generated, point);
            if (!cell) return;
            const sample = (detailCell ? currentDetailSamples : samplesRef.current).find(sample => sample.id === cell.properties.id);
            setSelected(sample?.minutes ?? null);
            setJourney(sample?.itinerary ?? []);
            setSelectedMode(sample?.selectedMode);
            popup?.remove();
            const compact = map!.getContainer().clientWidth <= 900;
            if (!compact) {
              popup = new maplibre.Popup().setLngLat(event.lngLat)
                .setText(sample?.minutes == null ? "Journey time not available at this sample point." : `${sample.minutes} ${allDestinations?"% of the tightest commute limit":"min"}${sample.selectedMode ? ` by ${modeLabel(sample.selectedMode).toLowerCase()}` : ""} to ${destination.label}${withinTravelTime(sample.minutes, destination) ? " · within your travel-time range" : " · outside your travel-time range"}.`)
                .addTo(map!);
            }
          });
          // Only routed times determine the visible area. The envelope is never shaded.
          void loadRoutes();
        });

        let overviewLoading=false;
        refreshOverviewRef.current=()=>{void loadRoutes();};
        async function loadRoutes() {
          if(overviewLoading||!visibleRef.current||controller.signal.aborted)return;
          overviewLoading=true;
          const samples: CommuteSample[] = [...samplesRef.current];
          try {
            for (let offset = samples.length; offset < ids.length; offset += 16) {
              if(!visibleRef.current||controller.signal.aborted)return;
              const response = await fetch("/api/commute", { method: "POST", signal: controller.signal,
                headers: { "Content-Type": "application/json" }, body: JSON.stringify({ destination:baseDestination, destinations:allDestinations?destinations:undefined, cells: ids.slice(offset, offset + 16) }),
              });
              const payload = await response.json() as { samples?: CommuteSample[]; error?: string };
              if (!response.ok || !payload.samples) throw new Error(payload.error ?? "Commute times could not load.");
              if (controller.signal.aborted) return;
              samples.push(...payload.samples);
              samplesRef.current = [...samples]; setSamples([...samples]);
              setProgress({ done: samples.length, total: ids.length, missing: samples.filter(sample => sample.minutes === null).length });
              autoFit?.();

            }
            autoFit?.(true);
          } catch (error) {
            if (!controller.signal.aborted) { autoFit?.(true); setRouteError(error instanceof Error ? error.message : "Commute times could not load."); }
          }finally{overviewLoading=false;}
        }
      } catch { if (!controller.signal.aborted) setStatus("error"); }
    }
    void setup();
    return () => { controller.abort(); detailController?.abort(); clearTimeout(detailTimer); refreshDetailRef.current = null;requestDetailRef.current=null;refreshOverviewRef.current=null; resizeObserver?.disconnect(); fitAreaRef.current = null; popup?.remove(); map?.remove(); mapRef.current = null; };
  }, [destination, baseDestination, allDestinations, destinations, retry, setView]);

  useEffect(() => {
    if(!selectedArea || status!=="ready")return;
    let cancelled=false;let marker:Marker|undefined;
    void import("maplibre-gl").then(({Marker})=>{
      if(cancelled||!mapRef.current)return;
      const map=mapRef.current;
      marker=new Marker({color:"#18332c"}).setLngLat([selectedArea.longitude,selectedArea.latitude]).addTo(map);
      focusRequested.current = true;
      map.flyTo({center:[selectedArea.longitude,selectedArea.latitude],zoom:Math.max(map.getZoom(),11),duration:600});
      setSelected(allDestinations?undefined:selectedArea.minutes);setSelectedMode(selectedArea.selectedMode);setJourney([]);
    });
    return()=>{cancelled=true;marker?.remove()};
  },[selectedArea,status,allDestinations]);
  useEffect(()=>{
    if(!mapInstance||!combinedMatches.length)return;
    let cancelled=false;const markers:Marker[]=[];
    void import('maplibre-gl').then(({Marker,Popup})=>{if(cancelled)return;for(const match of combinedMatches){const pin=document.createElement('button');pin.type='button';pin.className='combined-pin';pin.textContent='✓';pin.setAttribute('aria-label','Combined match: '+match.name);const popup=new Popup({offset:18}).setText(match.name+' · £'+match.price.toLocaleString('en-GB')+' mean matching sale price · '+match.journeys.map(j=>j.label+': '+j.minutes+' min').join(' · '));const marker=new Marker({element:pin}).setLngLat([match.longitude,match.latitude]).setPopup(popup).addTo(mapInstance);pin.addEventListener('click',e=>{e.stopPropagation();marker.togglePopup();});markers.push(marker);}});
    return()=>{cancelled=true;markers.forEach(marker=>marker.remove());};
  },[mapInstance,combinedMatches]);
  useLayoutEffect(() => { mapRef.current?.triggerRepaint(); }, [paths, detailPaths]);
  const minutesById = new Map(samples.map(sample => [sample.id, sample.minutes]));
  const detailMinutes = new Map(detailSamples.map(sample => [sample.id, sample.minutes]));
  const reachable = destination ? samples.filter(sample => withinTravelTime(sample.minutes, destination)).length : 0;
  const calloutTitle = selected == null
    ? (allDestinations ? "Shared commute area" : `${limits.minimum}–${limits.maximum} minutes`)
    : `${selected}${allDestinations ? "% of time limit" : " minutes"}`;
  const openControls = () => {
    if (compactChrome) setMobilePanel("controls");
  };
  const closeControls = () => {
    if (compactChrome) setMobilePanel(current => current === "controls" ? null : current);
  };
  const openLayers = () => {
    if (compactChrome) setMobilePanel("layers");
    else setDesktopLayersOpen(true);
  };
  const closeLayers = () => {
    if (compactChrome) setMobilePanel(current => current === "layers" ? null : current);
    else setDesktopLayersOpen(false);
  };
  const openCallout = () => {
    if (compactChrome) setMobilePanel("callout");
  };
  const closeCallout = () => {
    if (compactChrome) setMobilePanel(current => current === "callout" ? null : current);
  };
  const toggleExpanded = () => {
    setMobilePanel(null); setDesktopLayersOpen(false);
    focusRequested.current = true;
    element.current?.querySelectorAll<HTMLButtonElement>('.maplibregl-popup-close-button').forEach(button => button.click());
    setExpanded(value => !value);
  };
  return <>
    <div ref={element} className="google-map-canvas ready" aria-label="Areas within your travel-time range" />
    {(compactChrome || expanded) && <button ref={expandButton} type="button" className="map-expand-button" onClick={toggleExpanded} aria-label={expanded ? 'Exit full-screen map' : 'Expand map to full screen'} aria-expanded={expanded} title={expanded ? 'Exit full screen' : 'Expand map'}>
      <svg viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={expanded ? 'M9 3v6H3m12-6v6h6M9 21v-6H3m12 6v-6h6' : 'M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6'} /></svg>
    </button>}
    <svg className="commute-overlay" aria-label="Routed travel-time area" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
      <g ref={overlayRef}>
        <defs><mask id={maskId} maskUnits="userSpaceOnUse" x={-131072} y={-131072} width={262144} height={262144} style={{ maskType: "luminance" }}>
          <rect x={-131072} y={-131072} width={262144} height={262144} fill="white" />
          {detailPaths.map(cell => <path key={cell.id} d={cell.d} fill="black" />)}
        </mask></defs>
        <g mask={detailPaths.length ? "url(#" + maskId + ")" : undefined}>{visible && destination && paths.filter(cell => withinTravelTime(minutesById.get(cell.id), destination)).map(cell =>
          <path key={cell.id} d={cell.d} fill={commuteColour(minutesById.get(cell.id)!, limits.maximum)} fillOpacity={shading / 100} />)}</g>
        {visible && destination && detailPaths.filter(cell => withinTravelTime(detailMinutes.get(cell.id), destination)).map(cell =>
          <path key={cell.id} d={cell.d} fill={commuteColour(detailMinutes.get(cell.id)!, limits.maximum)} fillOpacity={shading / 100} />)}
      </g>
    </svg>
    {allDestinations && visible && status==='ready' && <div className="shared-commute-status" role="status">
      {routeError ? 'Shared commute map incomplete. Open Commute to retry.' : progress.done<progress.total
        ? `Checking shared area: ${progress.done} / ${progress.total} points · ${reachable} matches so far`
        : reachable ? `${reachable} shared points meet all ${destinations.length} journeys’ limits`
        : samples.some(sample=>sample.outcome==='unavailable') ? 'No shared match verified. Some journeys were unavailable; retry or view each destination.'
        : 'No shared match found in this sparse sample. Widen the time or distance limits, or view each destination.'}
    </div>}
    <details className="commute-controls" open={controlsOpen} onToggle={event => {
      const open = (event.currentTarget as HTMLDetailsElement).open;
      if (open) openControls();
      else closeControls();
    }}>
      <summary>
        <span className="map-chip-label">Commute</span>
        <span className="map-chip-meta">{destination?.label ?? "Destination"} · {allDestinations ? "overlap" : `${limits.minimum}–${limits.maximum} min`}</span>
      </summary>
      <div className="commute-controls-body">
        <label htmlFor="commute-destination">Commute to</label>
        <select id="commute-destination" value={destinationIndex} onChange={event => setDestinationIndex(Number(event.target.value))}>
          {destinations.length>1&&<option value={-1}>All destinations — commute overlap</option>}
          {destinations.map((item, index) => <option key={item.id} value={index}>{item.label}</option>)}
        </select>
        <label htmlFor="commute-mode">Travel mode</label>
        <select id="commute-mode" disabled={allDestinations} value={allDestinations?'multi':destination?.transportMode??'drive'} onChange={event=>onModeChange?.(event.target.value as TransportMode,Math.max(0,destinationIndex))}>
          {allDestinations&&<option value="multi">Each destination’s own mode</option>}<option value="any">Any travel mode — fastest available</option><option value="drive">Driving</option><option value="transit">Public transport + walking (bus, train, tram)</option><option value="cycle">Cycling</option><option value="walk">Walking</option>{destination?.transportMode==='mixed'&&<option value="mixed">Public transport + walking</option>}
        </select>
        {allDestinations&&<small>Overlap uses each destination’s own mode, time and distance limits. Choose a destination above to edit its travel mode.</small>}
        {!allDestinations&&destination?.departureTime&&<small>Leaving {new Date(destination.departureTime).toLocaleString("en-GB",{weekday:"short",hour:"2-digit",minute:"2-digit",day:"numeric",month:"short"})} · {destination.transportMode === "any" ? "fastest available travel mode" : "walking + all public transport"}</small>}
        {destination?.transportMode==="any"&&<small>Compares driving, public transport, cycling and walking.</small>}
        <button className="fit-area-button" onClick={()=>fitAreaRef.current?.()}>Show whole commute area</button>
        <strong>{allDestinations?"Within every destination’s limits":`${limits.minimum}–${limits.maximum} minutes`}</strong>
        <label className="commute-toggle"><input type="checkbox" checked={visible} onChange={event => setVisible(event.target.checked)} /> Show travel-time area</label>
        <label htmlFor="commute-opacity">Shading strength · {shading}%</label>
        <input id="commute-opacity" type="range" min="10" max="60" step="1" value={shading} onChange={event => setShading(Number(event.target.value))} />
        <small>Low-usage preview: a spread of independently checked points. Unshaded gaps are untested, not necessarily outside your limits. Zooming does not request more routes.</small>
        <button className="fit-area-button" onClick={()=>requestDetailRef.current?.()}>Check detail in this view</button>
        {detailStatus && <small role="status">{detailStatus}</small>}
        <small role="status">{routeError ? "Heatmap incomplete" : progress.done < progress.total ? `Checking routes: ${progress.done} / ${progress.total}` : `${reachable} sample points within range${progress.missing ? ` · ${progress.missing} ${allDestinations?"outside limits or unavailable":"unavailable"}` : ""}`}</small>
        {routeError && <div className="commute-error" role="alert">{routeError} <button onClick={() => setRetry(value => value + 1)}>Retry</button></div>}
      </div>
    </details>
    <MapLayers map={mapInstance} budget={budget} minimumBudget={minimumBudget} open={layersOpen} onOpenChange={open => open ? openLayers() : closeLayers()}/>
    <details className={`heat-callout${selected != null ? " has-selection" : ""}`} open={calloutOpen} onToggle={event => {
      const open = (event.currentTarget as HTMLDetailsElement).open;
      if (open) openCallout();
      else closeCallout();
    }}>
      <summary>
        <span className="eyebrow">Your travel-time area</span>
        <strong>{calloutTitle}</strong>
      </summary>
      <div className="heat-callout-body">
        <h2>{calloutTitle}</h2>
        <p>{selected === null ? allDestinations?"No shared commute match at this sample point.":"Journey time unavailable at this point." : `One-way journeys to ${destination?.label ?? "your destination"}.`}</p>
        {selectedMode&&<small><b>{destination?.transportMode==="any"?"Fastest available: ":"Travel mode: "}{modeLabel(selectedMode)}</b></small>}
        {journey.length>0&&<ol className="journey-steps" aria-label="Journey steps">{journey.map((step,index)=><li key={index}><b>{step.mode}{step.line?` ${step.line}`:""} · {step.minutes} min</b>{(step.from||step.to)&&<span>{step.from}{step.to?` → ${step.to}`:""}</span>}</li>)}</ol>}
        <small className="heat-callout-note">Shading follows routed journey times across council boundaries. Click the map to inspect a sample. Times are sampled estimates, not exact address-level contours.</small>
        <small className="heat-callout-note">Travel time only; property and distance preferences apply to the comparisons alongside.</small>
      </div>
    </details>
    <div className="heat-legend commute-legend"><b>{allDestinations?"HIGHEST SHARE OF A TIME LIMIT · %":"ONE-WAY COMMUTE · MINUTES"}</b><div className="commute-gradient"/><div className="commute-ticks">{[0, .25, .5, .75, 1].map(fraction => <span key={fraction}>{Math.round(limits.maximum * fraction)}</span>)}</div><small>{allDestinations?"Shaded samples meet every destination’s time and distance limits. Prices and schools are checked separately in combined matches.":`Only routes within ${limits.minimum}–${limits.maximum} min are shaded.`}</small></div>
    {status === "loading" && <div className="map-status">Preparing travel-time area…</div>}
    {status === "error" && <div className="map-status" role="alert">The map could not load. Please try again.</div>}
  </>;
}
