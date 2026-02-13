// src/components/OpenLayersMap.tsx
import { useEffect, useRef } from "react";
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
      controls: [], // Hides default controls to keep your UI clean
    });

    mapRef.current = map;

    // Handle Marker Clicks
    map.on("click", (evt) => {
      const feature = map.forEachFeatureAtPixel(
        evt.pixel,
        (feature) => feature,
      );
      if (feature) {
        const id = feature.get("id");
        if (id && onMarkerClick) {
          onMarkerClick(id);
        }
      }
    });

    return () => map.setTarget(undefined);
  }, []); // Run once on mount

  // Update Markers when issues change
  useEffect(() => {
    if (!vectorSourceRef.current) return;

    vectorSourceRef.current.clear();

    const features = issues.map((issue) => {
      const feature = new Feature({
        geometry: new Point(fromLonLat([issue.lng, issue.lat])),
        id: issue.id,
        type: issue.type,
      });

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
    <div
      ref={mapElement}
      className="absolute inset-0 w-full h-full z-0"
      style={{ background: "#e5e7eb" }}
    />
  );
}