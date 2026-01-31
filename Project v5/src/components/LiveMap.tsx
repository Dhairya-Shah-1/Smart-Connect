import { useEffect } from 'react';

declare global {
  interface Window {
    mappls: any;
  }
}

export function LiveMap() {
  useEffect(() => {
    if (!window.mappls) return;

    const map = new window.mappls.Map('mappls-map', {
      center: [19.0760, 72.8777], // Mumbai
      zoom: 12,
      search: false,
      location: true,
      zoomControl: true,
      fullscreenControl: false,
    });

    const incidents = [
      { id: 1, lat: 19.076, lng: 72.8777, type: 'Pothole', severity: 'Low' },
      { id: 2, lat: 19.09, lng: 72.88, type: 'Flood', severity: 'Critical' },
      { id: 3, lat: 19.065, lng: 72.86, type: 'Fire Hazard', severity: 'High' },
    ];

    incidents.forEach((i) => {
      new window.mappls.Marker({
        map,
        position: { lat: i.lat, lng: i.lng },
        popupHtml: `
          <div style="font-size:14px">
            <b>${i.type}</b><br/>
            Severity: ${i.severity}
          </div>
        `,
      });
    });
  }, []);

  return <div id="mappls-map" className="w-full h-full" />;
}