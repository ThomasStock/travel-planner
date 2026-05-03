import L, { type LatLngExpression, type LayerGroup, type Map as LeafletMap } from "leaflet";
import { LitElement, css, html, nothing, svg, unsafeCSS } from "lit";
import leafletStyles from "leaflet/dist/leaflet.css?inline";

type TravelMode = "bike" | "boat" | "bus" | "car" | "ferry" | "flight" | "plane" | "train" | "walk" | string;

interface StopLocation {
  lat: number;
  lng: number;
}

interface ItineraryStop {
  id: string;
  title: string;
  countryCode?: string;
  date?: string;
  dateRange?: string;
  timestamp?: string;
  description?: string;
  location?: StopLocation;
}

interface ItinerarySegment {
  from?: string;
  to?: string;
  mapFrom?: string;
  mapTo?: string;
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

const countryNames: Record<string, string> = {
  BE: "Belgium",
  DE: "Germany",
  DK: "Denmark",
};

const hasText = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const hasLocation = (stop: ItineraryStop): stop is MappedStop => Number.isFinite(stop.location?.lat) && Number.isFinite(stop.location?.lng);
const stopDate = (stop: ItineraryStop) => [stop.dateRange || stop.date, stop.timestamp].filter(hasText).join(" · ");
const stopLatLng = (stop: MappedStop): LatLngExpression => [stop.location.lat, stop.location.lng];
const countryIcon = (countryCode?: string) => {
  if (!hasText(countryCode) || countryCode.length !== 2) {
    return "";
  }

  return String.fromCodePoint(
    ...countryCode
      .toUpperCase()
      .split("")
      .map((letter) => 127397 + letter.charCodeAt(0)),
  );
};

const modeIcon = (mode?: TravelMode) => {
  switch (mode) {
    case "bike":
      return svg`
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="6" cy="17.5" r="3"></circle>
          <circle cx="18" cy="17.5" r="3"></circle>
          <path d="M8.9 17.5 11.4 12.3l2.9 5.2"></path>
          <path d="M11.4 12.3h3.9l2 5.2"></path>
          <path d="M10.2 10.2h2.3"></path>
          <path d="M10.6 10.2 11.4 12.3"></path>
          <path d="M15.8 9.8h1.8"></path>
          <path d="M15.6 12.3 16.4 9.8"></path>
        </svg>
      `;
    case "ferry":
    case "boat":
      return svg`
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5.2 15.8 7 8h10l1.8 7.8"></path>
          <path d="M8.2 8V5.5h7.6V8"></path>
          <path d="M3.8 15.8h16.4l-2 3.3a3.5 3.5 0 0 1-5 .9 3.5 3.5 0 0 1-4.4 0 3.5 3.5 0 0 1-5-.9l-2-3.3Z"></path>
        </svg>
      `;
    case "train":
      return svg`
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="6" y="3.5" width="12" height="13.5" rx="2.4"></rect>
          <path d="M8.5 7.5h7"></path>
          <path d="M8.5 11.2h7"></path>
          <circle cx="9" cy="14.5" r="1"></circle>
          <circle cx="15" cy="14.5" r="1"></circle>
          <path d="m8 20 2.2-3"></path>
          <path d="m16 20-2.2-3"></path>
        </svg>
      `;
    default:
      return svg`
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3.5v17"></path>
          <path d="m5.5 14.5 6.5 6 6.5-6"></path>
        </svg>
      `;
  }
};

class TravelItinerary extends LitElement {
  static properties = {
    data: { attribute: false },
    selectedStopId: { attribute: false },
    mobileMapStuck: { type: Boolean, reflect: true, attribute: "mobile-map-stuck" },
  };

  data: ItineraryData = emptyItinerary();
  selectedStopId = "";
  mobileMapStuck = false;
  #mobileMapStateFrame = 0;

  static styles = css`
    :host {
      display: block;
      min-height: 100vh;
      --mobile-map-height: 25dvh;
      --mobile-map-fade-height: 44px;
      --mobile-map-gap: 84px;
      --mobile-first-stop-space: 40px;
      --page-background: radial-gradient(circle at 15% 12%, rgba(0, 144, 128, 0.12), transparent 28rem),
        linear-gradient(135deg, #fbfaf7 0%, #f3f7f5 48%, #f8f4f0 100%);
      color: #171b22;
      background: var(--page-background);
      font-family:
        Inter,
        ui-sans-serif,
        system-ui,
        -apple-system,
        BlinkMacSystemFont,
        "Segoe UI",
        sans-serif;
    }

    * {
      box-sizing: border-box;
    }

    .shell {
      width: min(1180px, 100%);
      margin: 0 auto;
      padding: 28px clamp(16px, 4vw, 40px) 40px;
      overflow: visible;
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
      z-index: 8;
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
        gap: 0;
      }

      trip-map {
        position: sticky;
        top: 0;
        order: -1;
        width: 100vw;
        margin-left: calc(50% - 50vw);
        margin-right: calc(50% - 50vw);
        margin-bottom: calc(var(--mobile-map-gap) - var(--mobile-map-height));
        z-index: 12;
      }

      trip-timeline {
        padding-top: calc(var(--mobile-map-height) - var(--mobile-map-gap) + var(--mobile-first-stop-space));
      }

      :host([mobile-map-stuck]) trip-map::after {
        content: "";
        position: absolute;
        right: 0;
        top: 100%;
        left: 0;
        height: var(--mobile-map-fade-height);
        background-image: var(--page-background);
        background-repeat: no-repeat;
        background-size: 100vw 100vh;
        background-position: center top;
        -webkit-mask-image: linear-gradient(180deg, rgba(0, 0, 0, 1) 0%, rgba(0, 0, 0, 0.9) 28%, rgba(0, 0, 0, 0) 100%);
        mask-image: linear-gradient(180deg, rgba(0, 0, 0, 1) 0%, rgba(0, 0, 0, 0.9) 28%, rgba(0, 0, 0, 0) 100%);
        pointer-events: none;
        z-index: 13;
      }
    }
  `;

  connectedCallback() {
    super.connectedCallback();
    if (!this.data?.stops?.length) {
      this.data = this.#readData();
      this.selectedStopId = this.data.stops?.[0]?.id || "";
    }

    if (typeof window !== "undefined") {
      window.addEventListener("scroll", this.#queueMobileMapStateSync, { passive: true });
      window.addEventListener("resize", this.#queueMobileMapStateSync);
    }
  }

  firstUpdated() {
    this.#syncMobileMapState();
  }

  disconnectedCallback() {
    if (typeof window !== "undefined") {
      window.removeEventListener("scroll", this.#queueMobileMapStateSync);
      window.removeEventListener("resize", this.#queueMobileMapStateSync);
    }

    if (this.#mobileMapStateFrame) {
      cancelAnimationFrame(this.#mobileMapStateFrame);
      this.#mobileMapStateFrame = 0;
    }

    super.disconnectedCallback();
  }

  #queueMobileMapStateSync = () => {
    if (this.#mobileMapStateFrame) {
      return;
    }

    this.#mobileMapStateFrame = requestAnimationFrame(() => {
      this.#mobileMapStateFrame = 0;
      this.#syncMobileMapState();
    });
  };

  #syncMobileMapState() {
    if (typeof window === "undefined") {
      return;
    }

    const isCompactScreen = window.matchMedia("(max-width: 860px)").matches;
    const mapElement = this.renderRoot.querySelector("trip-map");
    if (!isCompactScreen || !mapElement) {
      if (this.mobileMapStuck) {
        this.mobileMapStuck = false;
      }
      return;
    }

    const mapTop = mapElement.getBoundingClientRect().top;
    const engageThreshold = 0.5;
    const releaseThreshold = 24;
    const nextState = this.mobileMapStuck ? mapTop <= releaseThreshold : mapTop <= engageThreshold;

    if (nextState !== this.mobileMapStuck) {
      this.mobileMapStuck = nextState;
    }
  }

  #readData(): ItineraryData {
    const source = this.querySelector('script[type="application/json"]');
    if (!source?.textContent?.trim()) {
      return emptyItinerary();
    }

    try {
      const parsed = JSON.parse(source.textContent) as Partial<ItineraryData> & { legs?: ItinerarySegment[] };
      const segments = Array.isArray(parsed.segments) ? parsed.segments : Array.isArray(parsed.legs) ? parsed.legs : [];

      return {
        ...parsed,
        stops: Array.isArray(parsed.stops) ? parsed.stops : [],
        segments,
      };
    } catch (error) {
      console.error("Invalid itinerary JSON", error);
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
          ${hasText(dates) ? html`<p class="meta">${dates}</p>` : nothing} ${hasText(title) ? html`<h1>${title}</h1>` : nothing}
          ${hasText(summary) ? html`<p class="summary">${summary}</p>` : nothing}
        </header>
        <div class="layout" @stop-select=${this.#selectStop} @stop-hover=${this.#selectStop}>
          <trip-timeline .stops=${stops} .segments=${segments} .selectedStopId=${this.selectedStopId}></trip-timeline>
          <trip-map .stops=${stops} .segments=${segments} .selectedStopId=${this.selectedStopId}></trip-map>
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
  selectedStopId = "";
  #observer?: IntersectionObserver;
  #visibleRatios = new Map<string, number>();

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

  firstUpdated() {
    this.#observeStops();
  }

  updated(changedProperties: Map<string, unknown>) {
    if (changedProperties.has("stops")) {
      this.#observeStops();
    }
  }

  disconnectedCallback() {
    this.#observer?.disconnect();
    this.#observer = undefined;
    super.disconnectedCallback();
  }

  #observeStops() {
    this.#observer?.disconnect();
    this.#visibleRatios.clear();

    const stopElements = Array.from(this.renderRoot.querySelectorAll<TripStop>("trip-stop"));
    if (!stopElements.length || typeof IntersectionObserver === "undefined") {
      return;
    }

    this.#observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const stopId = entry.target.getAttribute("data-stop-id");
          if (!stopId) {
            continue;
          }

          if (entry.isIntersecting) {
            this.#visibleRatios.set(stopId, entry.intersectionRatio);
          } else {
            this.#visibleRatios.delete(stopId);
          }
        }

        const nextStopId = this.#mostVisibleStopId();
        if (!nextStopId || nextStopId === this.selectedStopId) {
          return;
        }

        this.dispatchEvent(
          new CustomEvent("stop-hover", {
            bubbles: true,
            composed: true,
            detail: { id: nextStopId },
          }),
        );
      },
      {
        root: null,
        threshold: [0.2, 0.35, 0.5, 0.65, 0.8],
        rootMargin: "-14% 0px -48% 0px",
      },
    );

    for (const element of stopElements) {
      this.#observer.observe(element);
    }
  }

  #mostVisibleStopId() {
    let bestId = "";
    let bestRatio = -1;

    for (const stop of this.stops) {
      const ratio = this.#visibleRatios.get(stop.id) ?? -1;
      if (ratio > bestRatio) {
        bestRatio = ratio;
        bestId = stop.id;
      }
    }

    return bestRatio > 0 ? bestId : "";
  }

  render() {
    return html`
      <section class="timeline" aria-label="Itinerary timeline">
        ${this.stops.map(
          (stop, index) => html`
            <trip-stop data-stop-id=${stop.id} .stop=${stop} .index=${index + 1} .selected=${this.selectedStopId === stop.id}></trip-stop>
            ${index < this.stops.length - 1 ? html`<trip-segment .segment=${this.#segmentAfter(stop, index)}></trip-segment>` : nothing}
          `,
        )}
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

  stop: ItineraryStop = { id: "", title: "" };
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
      grid-template-columns: 40px minmax(0, 1fr);
      gap: 16px;
      align-items: start;
      padding: 16px;
      background: rgba(255, 255, 255, 0.76);
      color: inherit;
      text-align: left;
      box-shadow: 0 14px 34px rgba(23, 27, 34, 0.08);
      cursor: pointer;
      transition:
        border-color 160ms ease,
        box-shadow 160ms ease,
        transform 160ms ease;
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
      width: 40px;
      height: 40px;
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
      padding-top: 2px;
    }

    .heading {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
    }

    h2 {
      margin: 0;
      font-size: clamp(22px, 4vw, 30px);
      line-height: 1.1;
      letter-spacing: 0;
    }

    .country {
      display: inline-block;
      flex: 0 0 auto;
      font-size: 21px;
      line-height: 1;
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
        width: 34px;
        height: 34px;
        font-size: 12px;
      }
    }
  `;

  #select() {
    this.dispatchEvent(
      new CustomEvent("stop-select", {
        bubbles: true,
        composed: true,
        detail: { id: this.stop.id },
      }),
    );
  }

  #hover() {
    this.dispatchEvent(
      new CustomEvent("stop-hover", {
        bubbles: true,
        composed: true,
        detail: { id: this.stop.id },
      }),
    );
  }

  render() {
    const date = stopDate(this.stop);
    const flag = countryIcon(this.stop.countryCode);
    const countryName = hasText(this.stop.countryCode) ? countryNames[this.stop.countryCode.toUpperCase()] : undefined;

    return html`
      <button type="button" @click=${this.#select} @pointerenter=${this.#hover}>
        <span class="index">${this.index}</span>
        <span class="content">
          <span class="heading">
            <h2>${this.stop.title}</h2>
            ${hasText(flag) ? html`<span class="country" title=${countryName || this.stop.countryCode}>${flag}</span>` : nothing}
          </span>
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
      padding: 0 16px;
    }

    .segment {
      display: grid;
      grid-template-columns: 40px minmax(0, 1fr);
      gap: 16px;
      padding: 10px 0;
      color: #52605f;
      align-items: stretch;
    }

    .rail {
      position: relative;
      display: grid;
      place-items: center;
      min-height: 100%;
    }

    .rail::before,
    .rail::after {
      content: "";
      position: absolute;
      left: 50%;
      transform: translateX(-50%);
      width: 0;
      border-left: 2px dashed rgba(0, 108, 103, 0.42);
    }

    .rail::before {
      top: 0;
      bottom: calc(50% + 26px);
    }

    .rail::after {
      top: calc(50% + 26px);
      bottom: 0;
    }

    .mode {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      display: grid;
      place-items: center;
      background: #d45c3d;
      color: #fff;
      box-shadow: 0 4px 12px rgba(212, 92, 61, 0.3);
      flex-shrink: 0;
    }

    .mode svg {
      width: 20px;
      height: 20px;
      fill: none;
      stroke: currentColor;
      stroke-linecap: round;
      stroke-linejoin: round;
      stroke-width: 1.8;
    }

    .content {
      display: grid;
      gap: 5px;
      min-width: 0;
      padding-top: 2px;
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
        padding: 0 14px;
      }

      .segment {
        grid-template-columns: 34px minmax(0, 1fr);
        gap: 12px;
      }

      .rail::before {
        bottom: calc(50% + 22px);
      }

      .rail::after {
        top: calc(50% + 22px);
      }

      .mode {
        width: 34px;
        height: 34px;
      }

      .mode svg {
        width: 18px;
        height: 18px;
      }
    }
  `;

  render() {
    const segment = this.segment || {};
    const facts = [segment.duration, segment.distance].filter(hasText);
    const icon = modeIcon(segment.mode);

    if (!hasText(segment.title) && !hasText(segment.description) && facts.length === 0) {
      return nothing;
    }

    return html`
      <div class="segment">
        <span class="rail">
          <span class="mode" title=${hasText(segment.mode) ? segment.mode : "travel"}>${icon}</span>
        </span>
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
  selectedStopId = "";
  #map?: LeafletMap;
  #layers?: LayerGroup;
  #lastRenderedKey = "";

  static styles = [
    unsafeCSS(leafletStyles),
    css`
      :host {
        display: block;
      }

      .frame {
        position: relative;
        isolation: isolate;
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
        font-family:
          Inter,
          ui-sans-serif,
          system-ui,
          -apple-system,
          BlinkMacSystemFont,
          "Segoe UI",
          sans-serif;
        background: #d9eeed;
      }

      .leaflet-tooltip {
        border: 1px solid rgba(23, 27, 34, 0.12);
        border-radius: 6px;
        color: #171b22;
        font-weight: 800;
        box-shadow: 0 8px 20px rgba(23, 27, 34, 0.12);
      }

      .map-stop-marker {
        width: 26px;
        height: 26px;
        border: 2px solid #006c67;
        border-radius: 50%;
        display: grid;
        place-items: center;
        background: #fff;
        box-shadow: 0 8px 18px rgba(23, 27, 34, 0.18);
        color: #171b22;
        font-size: 13px;
        font-weight: 850;
        line-height: 1;
      }

      .map-stop-marker.selected {
        border-color: #171b22;
        background: #d45c3d;
        transform: scale(1.14);
      }

      @media (max-width: 860px) {
        .map {
          height: var(--mobile-map-height, 25dvh);
          min-height: var(--mobile-map-height, 25dvh);
          max-height: var(--mobile-map-height, 25dvh);
          border-right: 0;
          border-left: 0;
          border-radius: 0;
        }
      }

      @media (max-width: 520px) {
        .map {
          height: var(--mobile-map-height, 25dvh);
          min-height: var(--mobile-map-height, 25dvh);
          max-height: var(--mobile-map-height, 25dvh);
        }
      }
    `,
  ];

  firstUpdated() {
    const container = this.renderRoot.querySelector<HTMLElement>(".map");
    if (!container) {
      return;
    }

    this.#map = L.map(container, {
      attributionControl: true,
      scrollWheelZoom: false,
      zoomControl: false,
    });
    L.control.zoom({ position: "bottomleft" }).addTo(this.#map);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors",
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
    const isTrain = segment.mode === "train";
    const isFerry = segment.mode === "ferry";

    return {
      color: isTrain ? "#4a5fbc" : isFerry ? "#007a8a" : "#d45c3d",
      weight: isTrain ? 3 : 4,
      opacity: 0.88,
      dashArray: isTrain ? "8 8" : isFerry ? "2 8" : undefined,
    };
  }

  #syncMap() {
    if (!this.#map || !this.#layers) {
      return;
    }

    const map = this.#map;
    const layers = this.#layers;
    const mappedStops = this.stops.filter(hasLocation);
    if (!mappedStops.length) {
      layers.clearLayers();
      this.#lastRenderedKey = "";
      return;
    }

    const renderKey = JSON.stringify({
      stops: mappedStops.map((stop) => [stop.id, stop.location.lat, stop.location.lng]),
      segments: this.segments.map((segment) => [segment.from, segment.to, segment.mapFrom, segment.mapTo, segment.mode, segment.title]),
    });

    const shouldRefit = this.#lastRenderedKey !== renderKey;
    layers.clearLayers();
    this.#lastRenderedKey = renderKey;

    for (const segment of this.segments) {
      const from = this.#stopById(segment.mapFrom || segment.from);
      const to = this.#stopById(segment.mapTo || segment.to);
      if (!from || !to) {
        continue;
      }

      L.polyline([stopLatLng(from), stopLatLng(to)], this.#segmentStyle(segment))
        .bindTooltip(segment.title || "")
        .addTo(layers);
    }

    mappedStops.forEach((stop, index) => {
      const selected = stop.id === this.selectedStopId;
      const marker = L.marker(stopLatLng(stop), {
        icon: L.divIcon({
          className: "",
          html: `<span class="map-stop-marker${selected ? " selected" : ""}">${index + 1}</span>`,
          iconAnchor: [13, 13],
        }),
      });

      marker
        .bindTooltip(`${index + 1}. ${stop.title}`, {
          direction: "top",
          offset: [0, -8],
        })
        .on("click", () => this.#select(stop.id))
        .on("mouseover", () => this.#hover(stop.id))
        .addTo(layers);

      if (selected) {
        marker.openTooltip();
      }
    });

    if (shouldRefit) {
      const bounds = L.latLngBounds(mappedStops.map(stopLatLng));
      map.fitBounds(bounds, { padding: [24, 24] });
    }
  }

  #select(id: string) {
    this.dispatchEvent(
      new CustomEvent("stop-select", {
        bubbles: true,
        composed: true,
        detail: { id },
      }),
    );
  }

  #hover(id: string) {
    this.dispatchEvent(
      new CustomEvent("stop-hover", {
        bubbles: true,
        composed: true,
        detail: { id },
      }),
    );
  }

  render() {
    return html`
      <section class="frame">
        <section class="map" aria-label="OpenStreetMap itinerary map"></section>
      </section>
    `;
  }
}

customElements.define("travel-itinerary", TravelItinerary);
customElements.define("trip-timeline", TripTimeline);
customElements.define("trip-stop", TripStop);
customElements.define("trip-segment", TripSegment);
customElements.define("trip-map", TripMap);
