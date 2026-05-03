import L, { type LatLngExpression, type LayerGroup, type Map as LeafletMap } from 'leaflet';
import { LitElement, css, html, nothing, unsafeCSS } from 'lit';
import leafletStyles from 'leaflet/dist/leaflet.css?inline';

type TravelMode = 'bike' | 'boat' | 'bus' | 'car' | 'ferry' | 'flight' | 'plane' | 'train' | 'walk' | string;

interface StopLocation {
  lat: number;
  lng: number;
}

interface ItineraryStop {
  id: string;
  title: string;
  date?: string;
  dateRange?: string;
  timestamp?: string;
  description?: string;
  location?: StopLocation;
}

interface ItinerarySegment {
  from?: string;
  to?: string;
  mode?: TravelMode;
  title?: string;
  duration?: string;
  distance?: string;
  description?: string;
}

interface ItineraryData {
  title?: string;
  summary?: string;
  dates?: string;
  stops: ItineraryStop[];
  segments: ItinerarySegment[];
}

type MappedStop = ItineraryStop & { location: StopLocation };

const emptyItinerary = (): ItineraryData => ({ stops: [], segments: [] });

const modeIcons: Record<string, string> = {
  bike: 'B',
  boat: 'F',
  bus: 'U',
  car: 'C',
  ferry: 'F',
  flight: 'P',
  plane: 'P',
  train: 'T',
  walk: 'W',
};

const hasText = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const hasLocation = (stop: ItineraryStop): stop is MappedStop =>
  Number.isFinite(stop.location?.lat) && Number.isFinite(stop.location?.lng);
const stopDate = (stop: ItineraryStop) => [stop.dateRange || stop.date, stop.timestamp].filter(hasText).join(' · ');
const stopLatLng = (stop: MappedStop): LatLngExpression => [stop.location.lat, stop.location.lng];

class TravelItinerary extends LitElement {
  static properties = {
    data: { attribute: false },
    selectedStopId: { attribute: false },
  };

  data: ItineraryData = emptyItinerary();
  selectedStopId = '';

  static styles = css`
    :host {
      display: block;
      min-height: 100vh;
      color: #171b22;
      background:
        radial-gradient(circle at 15% 12%, rgba(0, 144, 128, 0.12), transparent 28rem),
        linear-gradient(135deg, #fbfaf7 0%, #f3f7f5 48%, #f8f4f0 100%);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    * {
      box-sizing: border-box;
    }

    .shell {
      width: min(1180px, 100%);
      margin: 0 auto;
      padding: 28px clamp(16px, 4vw, 40px) 40px;
      overflow: hidden;
    }

    header {
      display: grid;
      gap: 10px;
      padding: 16px 0 28px;
    }

    h1 {
      max-width: 780px;
      margin: 0;
      font-size: clamp(38px, 7vw, 76px);
      line-height: 0.98;
      letter-spacing: 0;
    }

    .meta,
    .summary {
      width: 100%;
      max-width: 720px;
      margin: 0;
      color: #52605f;
      font-size: clamp(15px, 2vw, 18px);
      line-height: 1.6;
      overflow-wrap: anywhere;
    }

    .meta {
      color: #006c67;
      font-weight: 750;
    }

    .layout {
      display: grid;
      grid-template-columns: minmax(0, 0.9fr) minmax(360px, 1.1fr);
      gap: 22px;
      align-items: start;
      min-width: 0;
    }

    .layout > * {
      min-width: 0;
    }

    trip-map {
      position: sticky;
      top: 18px;
    }

    @media (max-width: 860px) {
      .shell {
        width: 100vw;
        max-width: 100vw;
        padding-top: 18px;
      }

      header {
        padding-bottom: 20px;
      }

      .layout {
        grid-template-columns: 1fr;
      }

      trip-map {
        position: static;
        order: -1;
        width: 100%;
      }
    }
  `;

  connectedCallback() {
    super.connectedCallback();
    if (!this.data?.stops?.length) {
      this.data = this.#readData();
      this.selectedStopId = this.data.stops?.[0]?.id || '';
    }
  }

  #readData(): ItineraryData {
    const source = this.querySelector('script[type="application/json"]');
    if (!source?.textContent?.trim()) {
      return emptyItinerary();
    }

    try {
      const parsed = JSON.parse(source.textContent) as Partial<ItineraryData> & { legs?: ItinerarySegment[] };
      const segments = Array.isArray(parsed.segments)
        ? parsed.segments
        : Array.isArray(parsed.legs)
          ? parsed.legs
          : [];

      return {
        ...parsed,
        stops: Array.isArray(parsed.stops) ? parsed.stops : [],
        segments,
      };
    } catch (error) {
      console.error('Invalid itinerary JSON', error);
      return emptyItinerary();
    }
  }

  #selectStop(event: CustomEvent<{ id?: string }>) {
    this.selectedStopId = event.detail?.id || this.selectedStopId;
  }

  render() {
    const { title, summary, dates, stops = [], segments = [] } = this.data || {};

    return html`
      <div class="shell">
        <header>
          ${hasText(dates) ? html`<p class="meta">${dates}</p>` : nothing}
          ${hasText(title) ? html`<h1>${title}</h1>` : nothing}
          ${hasText(summary) ? html`<p class="summary">${summary}</p>` : nothing}
        </header>
        <div class="layout" @stop-select=${this.#selectStop} @stop-hover=${this.#selectStop}>
          <trip-timeline
            .stops=${stops}
            .segments=${segments}
            .selectedStopId=${this.selectedStopId}
          ></trip-timeline>
          <trip-map
            .stops=${stops}
            .segments=${segments}
            .selectedStopId=${this.selectedStopId}
          ></trip-map>
        </div>
      </div>
    `;
  }
}

class TripTimeline extends LitElement {
  static properties = {
    stops: { attribute: false },
    segments: { attribute: false },
    selectedStopId: { attribute: false },
  };

  stops: ItineraryStop[] = [];
  segments: ItinerarySegment[] = [];
  selectedStopId = '';

  static styles = css`
    :host {
      display: block;
    }

    .timeline {
      position: relative;
      display: grid;
      gap: 10px;
    }
  `;

  #segmentAfter(stop: ItineraryStop, index: number): ItinerarySegment | undefined {
    const nextStop = this.stops[index + 1];
    return this.segments.find((segment) => segment.from === stop.id && segment.to === nextStop?.id) || this.segments[index];
  }

  render() {
    return html`
      <section class="timeline" aria-label="Itinerary timeline">
        ${this.stops.map((stop, index) => html`
          <trip-stop
            .stop=${stop}
            .index=${index + 1}
            .selected=${this.selectedStopId === stop.id}
          ></trip-stop>
          ${index < this.stops.length - 1
            ? html`<trip-segment .segment=${this.#segmentAfter(stop, index)}></trip-segment>`
            : nothing}
        `)}
      </section>
    `;
  }
}

class TripStop extends LitElement {
  static properties = {
    stop: { attribute: false },
    index: { type: Number },
    selected: { type: Boolean, reflect: true },
  };

  stop: ItineraryStop = { id: '', title: '' };
  index = 1;
  selected = false;

  static styles = css`
    :host {
      display: block;
    }

    button {
      width: 100%;
      border: 1px solid color-mix(in srgb, #006c67 24%, transparent);
      border-radius: 8px;
      display: grid;
      grid-template-columns: 44px minmax(0, 1fr);
      gap: 14px;
      padding: 16px;
      background: rgba(255, 255, 255, 0.76);
      color: inherit;
      text-align: left;
      box-shadow: 0 14px 34px rgba(23, 27, 34, 0.08);
      cursor: pointer;
      transition: border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease;
    }

    button:hover,
    button:focus-visible,
    :host([selected]) button {
      border-color: #d45c3d;
      box-shadow: 0 18px 42px rgba(23, 27, 34, 0.13);
      outline: none;
      transform: translateY(-1px);
    }

    .index {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      display: grid;
      place-items: center;
      background: #006c67;
      color: #fff;
      font-weight: 850;
      font-size: 14px;
      line-height: 1;
    }

    .content {
      min-width: 0;
      display: grid;
      gap: 7px;
    }

    h2 {
      margin: 0;
      font-size: clamp(22px, 4vw, 30px);
      line-height: 1.1;
      letter-spacing: 0;
    }

    .date {
      color: #006c67;
      font-size: 13px;
      font-weight: 760;
      line-height: 1.35;
    }

    p {
      margin: 0;
      color: #52605f;
      font-size: 15px;
      line-height: 1.55;
      overflow-wrap: anywhere;
    }

    @media (max-width: 520px) {
      button {
        grid-template-columns: 34px minmax(0, 1fr);
        gap: 12px;
        padding: 14px;
      }

      .index {
        width: 30px;
        height: 30px;
        font-size: 12px;
      }
    }
  `;

  #select() {
    this.dispatchEvent(new CustomEvent('stop-select', {
      bubbles: true,
      composed: true,
      detail: { id: this.stop.id },
    }));
  }

  #hover() {
    this.dispatchEvent(new CustomEvent('stop-hover', {
      bubbles: true,
      composed: true,
      detail: { id: this.stop.id },
    }));
  }

  render() {
    const date = stopDate(this.stop);

    return html`
      <button type="button" @click=${this.#select} @pointerenter=${this.#hover}>
        <span class="index">${this.index}</span>
        <span class="content">
          <h2>${this.stop.title}</h2>
          ${hasText(date) ? html`<span class="date">${date}</span>` : nothing}
          ${hasText(this.stop.description) ? html`<p>${this.stop.description}</p>` : nothing}
        </span>
      </button>
    `;
  }
}

class TripSegment extends LitElement {
  static properties = {
    segment: { attribute: false },
  };

  segment?: ItinerarySegment;

  static styles = css`
    :host {
      display: block;
      padding: 0 0 0 38px;
    }

    .segment {
      display: grid;
      grid-template-columns: 30px minmax(0, 1fr);
      gap: 12px;
      padding: 8px 0 8px 22px;
      border-left: 2px dashed rgba(0, 108, 103, 0.42);
      color: #52605f;
    }

    .mode {
      width: 30px;
      height: 30px;
      border-radius: 50%;
      display: grid;
      place-items: center;
      background: #f6bf49;
      color: #171b22;
      font-size: 12px;
      font-weight: 850;
    }

    .content {
      display: grid;
      gap: 5px;
      min-width: 0;
    }

    .title {
      color: #283330;
      font-size: 14px;
      font-weight: 760;
      line-height: 1.35;
    }

    .facts {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      font-size: 13px;
      line-height: 1.4;
    }

    p {
      margin: 0;
      font-size: 13px;
      line-height: 1.5;
    }

    @media (max-width: 520px) {
      :host {
        padding-left: 28px;
      }

      .segment {
        grid-template-columns: 28px minmax(0, 1fr);
        padding-left: 16px;
      }
    }
  `;

  render() {
    const segment = this.segment || {};
    const facts = [segment.duration, segment.distance].filter(hasText);
    const icon = hasText(segment.mode) ? modeIcons[segment.mode] || '>' : '>';

    if (!hasText(segment.title) && !hasText(segment.description) && facts.length === 0) {
      return nothing;
    }

    return html`
      <div class="segment">
        <span class="mode" aria-hidden="true">${icon}</span>
        <span class="content">
          ${hasText(segment.title) ? html`<span class="title">${segment.title}</span>` : nothing}
          ${facts.length ? html`<span class="facts">${facts.map((fact) => html`<span>${fact}</span>`)}</span>` : nothing}
          ${hasText(segment.description) ? html`<p>${segment.description}</p>` : nothing}
        </span>
      </div>
    `;
  }
}

class TripMap extends LitElement {
  static properties = {
    stops: { attribute: false },
    segments: { attribute: false },
    selectedStopId: { attribute: false },
  };

  stops: ItineraryStop[] = [];
  segments: ItinerarySegment[] = [];
  selectedStopId = '';
  #map?: LeafletMap;
  #layers?: LayerGroup;

  static styles = [
    unsafeCSS(leafletStyles),
    css`
      :host {
        display: block;
      }

      .map {
        max-width: 100%;
        width: 100%;
        height: clamp(420px, 52vw, 680px);
        min-height: 420px;
        border: 1px solid rgba(23, 27, 34, 0.12);
        border-radius: 8px;
        overflow: hidden;
        box-shadow: 0 18px 42px rgba(23, 27, 34, 0.12);
      }

      .leaflet-container {
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #d9eeed;
      }

      .leaflet-tooltip {
        border: 1px solid rgba(23, 27, 34, 0.12);
        border-radius: 6px;
        color: #171b22;
        font-weight: 800;
        box-shadow: 0 8px 20px rgba(23, 27, 34, 0.12);
      }

      @media (max-width: 520px) {
        .map {
          height: 360px;
          min-height: 360px;
        }
      }
    `,
  ];

  firstUpdated() {
    const container = this.renderRoot.querySelector<HTMLElement>('.map');
    if (!container) {
      return;
    }

    this.#map = L.map(container, {
      attributionControl: true,
      scrollWheelZoom: false,
      zoomControl: false,
    });
    L.control.zoom({ position: 'bottomleft' }).addTo(this.#map);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(this.#map);
    this.#layers = L.layerGroup().addTo(this.#map);
    this.#syncMap();
  }

  updated() {
    this.#syncMap();
  }

  disconnectedCallback() {
    this.#map?.remove();
    this.#map = undefined;
    super.disconnectedCallback();
  }

  #stopById(id?: string): MappedStop | undefined {
    return this.stops.find((stop): stop is MappedStop => stop.id === id && hasLocation(stop));
  }

  #segmentStyle(segment: ItinerarySegment) {
    const isTrain = segment.mode === 'train';
    const isFerry = segment.mode === 'ferry';

    return {
      color: isTrain ? '#4a5fbc' : isFerry ? '#007a8a' : '#d45c3d',
      weight: isTrain ? 3 : 4,
      opacity: 0.88,
      dashArray: isTrain ? '8 8' : isFerry ? '2 8' : undefined,
    };
  }

  #syncMap() {
    if (!this.#map || !this.#layers) {
      return;
    }

    const map = this.#map;
    const layers = this.#layers;
    layers.clearLayers();
    const mappedStops = this.stops.filter(hasLocation);
    if (!mappedStops.length) {
      return;
    }

    for (const segment of this.segments) {
      const from = this.#stopById(segment.from);
      const to = this.#stopById(segment.to);
      if (!from || !to) {
        continue;
      }

      L.polyline([stopLatLng(from), stopLatLng(to)], this.#segmentStyle(segment))
        .bindTooltip(segment.title || '')
        .addTo(layers);
    }

    mappedStops.forEach((stop, index) => {
      const selected = stop.id === this.selectedStopId;
      const marker = L.circleMarker(stopLatLng(stop), {
        radius: selected ? 10 : 7,
        color: selected ? '#171b22' : '#006c67',
        fillColor: selected ? '#d45c3d' : '#ffffff',
        fillOpacity: 1,
        weight: selected ? 3 : 2,
      });

      marker
        .bindTooltip(`${index + 1}. ${stop.title}`, {
          direction: 'top',
          offset: [0, -8],
        })
        .on('click', () => this.#select(stop.id))
        .on('mouseover', () => this.#hover(stop.id))
        .addTo(layers);
    });

    const bounds = L.latLngBounds(mappedStops.map(stopLatLng));
    map.fitBounds(bounds, { padding: [24, 24] });
  }

  #select(id: string) {
    this.dispatchEvent(new CustomEvent('stop-select', {
      bubbles: true,
      composed: true,
      detail: { id },
    }));
  }

  #hover(id: string) {
    this.dispatchEvent(new CustomEvent('stop-hover', {
      bubbles: true,
      composed: true,
      detail: { id },
    }));
  }

  render() {
    return html`<section class="map" aria-label="OpenStreetMap itinerary map"></section>`;
  }
}

customElements.define('travel-itinerary', TravelItinerary);
customElements.define('trip-timeline', TripTimeline);
customElements.define('trip-stop', TripStop);
customElements.define('trip-segment', TripSegment);
customElements.define('trip-map', TripMap);
