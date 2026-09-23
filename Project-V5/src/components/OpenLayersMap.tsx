import { useEffect, useRef, useState } from "react";
import "ol/ol.css";
import Map from "ol/Map";
import View from "ol/View";
import TileLayer from "ol/layer/Tile";
import OSM from "ol/source/OSM";
import { fromLonLat } from "ol/proj";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import Feature from "ol/Feature";
import Point from "ol/geom/Point";
import { Icon, Style } from "ol/style";
import { defaults as defaultInteractions } from "ol/interaction/defaults";
import { unByKey } from "ol/Observable";
import { ZoomIn, ZoomOut } from "lucide-react";
import { useTheme } from "../App";

// Define the shape of an Issue based on your project
interface Issue {
  id: string;
  lat: number;
  lng: number;
  type: string;
  severity: string;
}

interface OpenLayersMapProps {
  issues: Issue[];
  onMarkerClick?: (issueId: string) => void;
}

export function OpenLayersMap({
  issues,
  onMarkerClick,
}: OpenLayersMapProps) {
  const mapElement = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const vectorSourceRef = useRef<VectorSource | null>(null);
  const [zoomLevel, setZoomLevel] = useState(12);
  const { theme } = useTheme();
  const isDark = theme === "dark";

  // Keep the latest onMarkerClick callback in a ref so the map (initialized
  // once) never calls a stale closure without having to re-create the map.
  const onMarkerClickRef = useRef(onMarkerClick);
  useEffect(() => {
    onMarkerClickRef.current = onMarkerClick;
  }, [onMarkerClick]);

  // Initialize Map
  useEffect(() => {
    if (!mapElement.current) return;

    // Create vector source for markers
    const vectorSource = new VectorSource();
    vectorSourceRef.current = vectorSource;

    const vectorLayer = new VectorLayer({
      source: vectorSource,
    });

    const map = new Map({
      target: mapElement.current,
      layers: [
        new TileLayer({
          source: new OSM(), // Uses OpenStreetMap
        }),
        vectorLayer,
      ],
      view: new View({
        center: fromLonLat([72.8777, 19.076]), // Default Center (Mumbai)
        zoom: 12,
      }),
      interactions: defaultInteractions({
        doubleClickZoom: true,    // Allow double-click to zoom in
        mouseWheelZoom: true,     // Allow mouse scroll to zoom
        pinchZoom: true,          // Allow pinch-to-zoom on mobile
      }),
      controls: [], // Hides default controls to keep your UI clean
    });

    mapRef.current = map;

    // Update zoom level when the view changes.
    // NOTE: OpenLayers 10's View sets `zoom` with `set('zoom', value, true)`
    // (silent), so "change:zoom" never fires. "change:resolution" is the
    // event that actually fires on every zoom change (wheel, dbl-click,
    // pinch, buttons, keyboard).
    const view = map.getView();
    const zoomChangeListener = view.on("change:resolution", () => {
      setZoomLevel(view.getZoom() || 12);
    });

    // Handle Marker Clicks
    const clickListener = map.on("click", (evt) => {
      const feature = map.forEachFeatureAtPixel(
        evt.pixel,
        (feature) => feature,
      );
      if (feature) {
        // Use getId() or get("issueId") to retrieve the ID
        const id = feature.getId() || feature.get("issueId");
        if (id && onMarkerClickRef.current) {
          onMarkerClickRef.current(id.toString());
        }
      }
    });

    return () => {
      // `view.on(...)` and `map.on(...)` return an OpenLayers EventsKey,
      // NOT a listener object with a `.remove()` method. They must be
      // released with `unByKey`, otherwise calling `.remove()` throws
      // during unmount and blanks the whole tab.
      unByKey(zoomChangeListener);
      unByKey(clickListener);
      mapRef.current = null;
      map.setTarget(undefined);
    };
  }, []); // Run once on mount

  // Handle Zoom In
  const handleZoomIn = () => {
    if (mapRef.current) {
      const view = mapRef.current.getView();
      const currentZoom = view.getZoom() || 12;
      view.animate({ zoom: Math.min(currentZoom + 1, 19) });
    }
  };

  // Handle Zoom Out
  const handleZoomOut = () => {
    if (mapRef.current) {
      const view = mapRef.current.getView();
      const currentZoom = view.getZoom() || 12;
      view.animate({ zoom: Math.max(currentZoom - 1, 1) });
    }
  };

  // Update Markers when issues change
  useEffect(() => {
    if (!vectorSourceRef.current) return;

    vectorSourceRef.current.clear();

    const features = issues.map((issue) => {
      const feature = new Feature({
        geometry: new Point(fromLonLat([issue.lng, issue.lat])),
      });

      // Set ID and properties explicitly
      feature.setId(issue.id);
      feature.set("type", issue.type);
      feature.set("issueId", issue.id);

      // Simple marker style (you can customize icons based on issue.type here)
      feature.setStyle(
        new Style({
          image: new Icon({
            anchor: [0.5, 1],
            src: "https://cdn-icons-png.flaticon.com/512/684/684908.png", // Generic Pin Icon
            scale: 0.07,
            color:
              issue.severity === "critical" ? "red" : "blue", // Color tint based on severity
          }),
        }),
      );

      return feature;
    });

    vectorSourceRef.current.addFeatures(features);
  }, [issues]);

  return (
    <div className="relative w-full h-full z-0">
      {/* Zoom Controls */}
      <div className="absolute top-4 right-2 z-10 flex flex-col gap-1.5">
        <button
          onClick={handleZoomIn}
          className="w-9 h-9 bg-white dark:bg-slate-800 rounded-lg shadow-lg flex items-center justify-center hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors border border-gray-200 dark:border-slate-700"
          aria-label="Zoom In"
        >
          <ZoomIn size={20} className="text-gray-700 dark:text-gray-200" />
        </button>
        <button
          onClick={handleZoomOut}
          className="w-9 h-9 bg-white dark:bg-slate-800 rounded-lg shadow-lg flex items-center justify-center hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors border border-gray-200 dark:border-slate-700 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white dark:disabled:hover:bg-slate-800"
          aria-label="Zoom Out"
          disabled={zoomLevel <= 1}
        >
          <ZoomOut size={20} className="text-gray-700 dark:text-gray-200" />
        </button>
      </div>

      {/* Map Container.
          Theme-aware canvas: a dark background in dark mode so the map area
          never shows a bright white rectangle against the dark dashboard. */}
      <div
        ref={mapElement}
        className="absolute inset-0 w-full h-full z-0"
        style={{ background: isDark ? "#0f172a" : "#e5e7eb" }}
      />
    </div>
  );
}
