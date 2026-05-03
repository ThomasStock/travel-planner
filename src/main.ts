import { mdiArrowRight, mdiBike, mdiFerry, mdiFullscreen, mdiFullscreenExit, mdiTrain } from "@mdi/js";
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
  kind?: "transfer";
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

type SegmentEventDetail = { key?: string };

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
const segmentKey = (segment?: ItinerarySegment) =>
  [segment?.from, segment?.to, segment?.mapFrom, segment?.mapTo, segment?.mode, segment?.title].join("|");
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

const libraryIcon = (path: string) => svg`
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d=${path}></path>
  </svg>
`;

const modeIcon = (mode?: TravelMode) => {
  switch (mode) {
    case "bike":
      return libraryIcon(mdiBike);
    case "ferry":
    case "boat":
      return libraryIcon(mdiFerry);
    case "train":
      return libraryIcon(mdiTrain);
    default:
      return libraryIcon(mdiArrowRight);
  }
};

class TravelItinerary extends LitElement {
  static properties = {
    data: { attribute: false },
    selectedStopId: { attribute: false },
    focusedStopId: { attribute: false },
    selectedSegmentKey: { attribute: false },
    focusedSegmentKey: { attribute: false },
    hoveredSegmentKey: { attribute: false },
  };

  data: ItineraryData = emptyItinerary();
  selectedStopId = "";
  focusedStopId = "";
  selectedSegmentKey = "";
  focusedSegmentKey = "";
  hoveredSegmentKey = "";

  static styles = css`
    :host {
      display: block;
      min-height: 100vh;
      --mobile-map-height: 25dvh;
      --mobile-map-gap: 84px;
      --mobile-first-stop-space: 40px;
      --shell-inline-padding: clamp(16px, 4vw, 40px);
      --page-background: radial-gradient(circle at 15% 12%, rgba(0, 144, 128, 0.12), transparent 28rem),
        linear-gradient(135deg, #fbfaf7 0%, #f3f7f5 48%, #f8f4f0 100%);
      color: #171b22;
      background: var(--page-background);
      overflow-x: clip;
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
      padding: 28px var(--shell-inline-padding) 40px;
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
        width: 100%;
        max-width: 100%;
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
        width: calc(100% + (var(--shell-inline-padding) * 2));
        max-width: none;
        margin-left: calc(var(--shell-inline-padding) * -1);
        margin-right: calc(var(--shell-inline-padding) * -1);
        margin-bottom: calc(var(--mobile-map-gap) - var(--mobile-map-height));
        border-bottom: 1px solid rgba(23, 27, 34, 0.14);
        z-index: 12;
      }

      trip-timeline {
        padding-top: calc(var(--mobile-map-height) - var(--mobile-map-gap) + var(--mobile-first-stop-space));
      }
    }
  `;

  connectedCallback() {
    super.connectedCallback();
    if (!this.data?.stops?.length) {
      this.data = this.#readData();
      this.selectedStopId = this.data.stops?.[0]?.id || "";
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
    const nextStopId = event.detail?.id || this.selectedStopId;
    this.selectedStopId = nextStopId;
    this.focusedStopId = nextStopId;
    this.selectedSegmentKey = "";
    this.focusedSegmentKey = "";
    this.hoveredSegmentKey = "";
  }

  #hoverStop(event: CustomEvent<{ id?: string }>) {
    this.selectedStopId = event.detail?.id || this.selectedStopId;
  }

  #selectSegment(event: CustomEvent<SegmentEventDetail>) {
    const nextSegmentKey = event.detail?.key || this.selectedSegmentKey;
    this.selectedSegmentKey = nextSegmentKey;
    this.focusedSegmentKey = nextSegmentKey;
    this.focusedStopId = "";
  }

  #hoverSegment(event: CustomEvent<SegmentEventDetail>) {
    this.hoveredSegmentKey = event.detail?.key || "";
  }

  render() {
    const { title, summary, dates, stops = [], segments = [] } = this.data || {};
    const activeSegmentKey = this.hoveredSegmentKey || this.selectedSegmentKey;

    return html`
      <div class="shell">
        <header>
          ${hasText(dates) ? html`<p class="meta">${dates}</p>` : nothing} ${hasText(title) ? html`<h1>${title}</h1>` : nothing}
          ${hasText(summary) ? html`<p class="summary">${summary}</p>` : nothing}
        </header>
        <div
          class="layout"
          @stop-select=${this.#selectStop}
          @stop-hover=${this.#hoverStop}
          @segment-select=${this.#selectSegment}
          @segment-hover=${this.#hoverSegment}
        >
          <trip-timeline
            .stops=${stops}
            .segments=${segments}
            .selectedStopId=${this.selectedStopId}
            .activeSegmentKey=${activeSegmentKey}
          ></trip-timeline>
          <trip-map
            .stops=${stops}
            .segments=${segments}
            .selectedStopId=${this.selectedStopId}
            .activeSegmentKey=${activeSegmentKey}
            .focusedStopId=${this.focusedStopId}
            .focusedSegmentKey=${this.focusedSegmentKey}
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
    activeSegmentKey: { attribute: false },
  };

  stops: ItineraryStop[] = [];
  segments: ItinerarySegment[] = [];
  selectedStopId = "";
  activeSegmentKey = "";
  #observer?: IntersectionObserver;
  #visibleRatios = new Map<string, number>();

  static styles = css`
    :host {
      display: block;
    }

    .timeline {
      position: relative;
      display: grid;
      gap: 4px;
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
            ${index < this.stops.length - 1
              ? html`<trip-segment
                  .segment=${this.#segmentAfter(stop, index)}
                  .active=${segmentKey(this.#segmentAfter(stop, index)) === this.activeSegmentKey}
                ></trip-segment>`
              : nothing}
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
      box-shadow: 0 24px 54px rgba(23, 27, 34, 0.18);
      outline: none;
      transform: translateY(-2px) scale(1.01);
      background: rgba(255, 255, 255, 0.94);
    }

    :host([selected]) .index,
    button:hover .index,
    button:focus-visible .index {
      transform: scale(1.1);
      box-shadow: 0 8px 20px rgba(0, 108, 103, 0.24);
    }

    button.transfer {
      grid-template-columns: minmax(0, 1fr);
      gap: 0;
      padding: 0 16px;
      background: transparent;
      border-color: transparent;
      border-radius: 0;
      box-shadow: none;
    }

    button.transfer:hover,
    button.transfer:focus-visible,
    :host([selected]) button.transfer {
      border-color: transparent;
      box-shadow: none;
      outline: none;
      transform: none;
      background: transparent;
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
      transition:
        transform 160ms ease,
        box-shadow 160ms ease,
        background-color 160ms ease;
    }

    .content {
      min-width: 0;
      display: grid;
      gap: 7px;
      padding-top: 2px;
    }

    button.transfer .content {
      gap: 0;
      padding-top: 0;
      opacity: 0.92;
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

    button.transfer h2 {
      font-size: clamp(16px, 2.6vw, 18px);
      line-height: 1.1;
      font-weight: 700;
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

    button.transfer .date {
      color: #52605f;
      font-size: 11px;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }

    p {
      margin: 0;
      color: #52605f;
      font-size: 15px;
      line-height: 1.55;
      overflow-wrap: anywhere;
    }

    button.transfer p {
      font-size: 14px;
      line-height: 1.45;
    }

    @media (max-width: 520px) {
      button {
        grid-template-columns: 34px minmax(0, 1fr);
        gap: 12px;
        padding: 14px;
      }

      button.transfer {
        grid-template-columns: minmax(0, 1fr);
        gap: 0;
        padding: 0 14px;
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
    const transfer = this.stop.kind === "transfer";
    const showFlag = !transfer && hasText(flag);
    const showDate = !transfer && hasText(date);
    const showDescription = !transfer && hasText(this.stop.description);

    return html`
      <button class=${transfer ? "transfer" : nothing} type="button" @click=${this.#select} @pointerenter=${this.#hover}>
        ${transfer ? nothing : html`<span class="index">${this.index}</span>`}
        <span class="content">
          <span class="heading">
            <h2>${this.stop.title}</h2>
            ${showFlag ? html`<span class="country" title=${countryName || this.stop.countryCode}>${flag}</span>` : nothing}
          </span>
          ${showDate ? html`<span class="date">${date}</span>` : nothing}
          ${showDescription ? html`<p>${this.stop.description}</p>` : nothing}
        </span>
      </button>
    `;
  }
}

class TripSegment extends LitElement {
  static properties = {
    segment: { attribute: false },
    active: { type: Boolean, reflect: true },
  };

  segment?: ItinerarySegment;
  active = false;

  static styles = css`
    :host {
      display: block;
      padding: 0 16px;
    }

    .segment {
      width: 100%;
      border: 0;
      display: grid;
      grid-template-columns: 40px minmax(0, 1fr);
      gap: 16px;
      padding: 6px 0;
      color: #52605f;
      align-items: stretch;
      background: transparent;
      text-align: left;
      cursor: pointer;
      transition:
        transform 160ms ease,
        box-shadow 160ms ease,
        background-color 160ms ease;
    }

    .segment:hover,
    .segment:focus-visible,
    :host([active]) .segment {
      background: transparent;
      box-shadow: none;
      outline: none;
      transform: none;
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
      transition: border-color 160ms ease;
    }

    .segment:hover .rail::before,
    .segment:hover .rail::after,
    .segment:focus-visible .rail::before,
    .segment:focus-visible .rail::after,
    :host([active]) .rail::before,
    :host([active]) .rail::after {
      border-left-color: rgba(212, 92, 61, 0.52);
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
      transition:
        transform 160ms ease,
        box-shadow 160ms ease,
        background-color 160ms ease;
    }

    .segment:hover .mode,
    .segment:focus-visible .mode,
    :host([active]) .mode {
      transform: scale(1.12);
      background: #b64528;
      box-shadow: 0 10px 24px rgba(212, 92, 61, 0.42);
    }

    .mode svg {
      width: 20px;
      height: 20px;
      display: block;
      fill: currentColor;
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

    .segment:hover .title,
    .segment:focus-visible .title,
    :host([active]) .title {
      color: #171b22;
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

  #emit(type: "segment-hover" | "segment-select", key?: string) {
    this.dispatchEvent(
      new CustomEvent<SegmentEventDetail>(type, {
        bubbles: true,
        composed: true,
        detail: { key },
      }),
    );
  }

  #select() {
    this.#emit("segment-select", segmentKey(this.segment));
  }

  #hover() {
    this.#emit("segment-hover", segmentKey(this.segment));
  }

  #leave() {
    this.#emit("segment-hover");
  }

  render() {
    const segment = this.segment || {};
    const facts = [segment.duration, segment.distance].filter(hasText);
    const icon = modeIcon(segment.mode);

    if (!hasText(segment.title) && !hasText(segment.description) && facts.length === 0) {
      return nothing;
    }

    return html`
      <button class="segment" type="button" @click=${this.#select} @pointerenter=${this.#hover} @pointerleave=${this.#leave}>
        <span class="rail">
          <span class="mode" title=${hasText(segment.mode) ? segment.mode : "travel"}>${icon}</span>
        </span>
        <span class="content">
          ${hasText(segment.title) ? html`<span class="title">${segment.title}</span>` : nothing}
          ${facts.length ? html`<span class="facts">${facts.map((fact) => html`<span>${fact}</span>`)}</span>` : nothing}
          ${hasText(segment.description) ? html`<p>${segment.description}</p>` : nothing}
        </span>
      </button>
    `;
  }
}

class TripMap extends LitElement {
  static properties = {
    stops: { attribute: false },
    segments: { attribute: false },
    selectedStopId: { attribute: false },
    activeSegmentKey: { attribute: false },
    focusedStopId: { attribute: false },
    focusedSegmentKey: { attribute: false },
    isFullscreen: { attribute: false },
  };

  stops: ItineraryStop[] = [];
  segments: ItinerarySegment[] = [];
  selectedStopId = "";
  activeSegmentKey = "";
  focusedStopId = "";
  focusedSegmentKey = "";
  isFullscreen = false;
  #map?: LeafletMap;
  #layers?: LayerGroup;
  #lastRenderedKey = "";
  #lastViewportKey = "";
  #lastMeasuredMapHeight = 0;
  #onFullscreenChange = () => {
    const frame = this.renderRoot.querySelector<HTMLElement>(".frame");
    this.isFullscreen = document.fullscreenElement === frame;
    requestAnimationFrame(() => {
      this.#syncDesktopMapHeight();
      this.#map?.invalidateSize();
    });
  };
  #onViewportChange = () => {
    this.#syncDesktopMapHeight();
  };

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

      .frame:fullscreen {
        background: #d9eeed;
      }

      .map {
        max-width: 100%;
        width: 100%;
        height: var(--desktop-map-height, calc(100dvh - 36px));
        min-height: var(--desktop-map-height, calc(100dvh - 36px));
        border: 1px solid rgba(23, 27, 34, 0.12);
        border-radius: 8px;
        overflow: hidden;
        box-shadow: 0 18px 42px rgba(23, 27, 34, 0.12);
      }

      .frame:fullscreen .map {
        height: 100dvh;
        min-height: 100dvh;
        border: 0;
        border-radius: 0;
        box-shadow: none;
      }

      .controls {
        position: absolute;
        top: 12px;
        right: 12px;
        z-index: 500;
        pointer-events: none;
      }

      .fullscreen-toggle {
        pointer-events: auto;
        width: 44px;
        height: 44px;
        border: 1px solid rgba(23, 27, 34, 0.12);
        border-radius: 999px;
        display: grid;
        place-items: center;
        background: rgba(255, 255, 255, 0.94);
        color: #171b22;
        box-shadow: 0 12px 28px rgba(23, 27, 34, 0.16);
        cursor: pointer;
        transition:
          transform 160ms ease,
          box-shadow 160ms ease,
          background-color 160ms ease,
          border-color 160ms ease;
      }

      .fullscreen-toggle:hover,
      .fullscreen-toggle:focus-visible {
        border-color: rgba(0, 108, 103, 0.4);
        background: #fff;
        box-shadow: 0 16px 34px rgba(23, 27, 34, 0.2);
        outline: none;
        transform: translateY(-1px);
      }

      .fullscreen-toggle svg {
        width: 22px;
        height: 22px;
        display: block;
        fill: currentColor;
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
        transition:
          transform 160ms ease,
          box-shadow 160ms ease,
          background-color 160ms ease,
          border-color 160ms ease;
      }

      .map-stop-marker.selected {
        border-width: 3px;
        border-color: #171b22;
        background: #d45c3d;
        color: #fff;
        transform: scale(1.28);
        box-shadow: 0 14px 32px rgba(212, 92, 61, 0.34);
      }

      @media (max-width: 860px) {
        .controls {
          top: 10px;
          right: 10px;
        }

        .fullscreen-toggle {
          width: 42px;
          height: 42px;
        }

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

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener("fullscreenchange", this.#onFullscreenChange);
    window.addEventListener("scroll", this.#onViewportChange, { passive: true });
    window.addEventListener("resize", this.#onViewportChange);
  }

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
    this.#syncDesktopMapHeight();
    this.#syncMap();
  }

  updated() {
    this.#syncMap();
  }

  disconnectedCallback() {
    document.removeEventListener("fullscreenchange", this.#onFullscreenChange);
    window.removeEventListener("scroll", this.#onViewportChange);
    window.removeEventListener("resize", this.#onViewportChange);
    this.#map?.remove();
    this.#map = undefined;
    super.disconnectedCallback();
  }

  #syncDesktopMapHeight() {
    const frame = this.renderRoot.querySelector<HTMLElement>(".frame");
    if (!frame || this.isFullscreen) {
      return;
    }

    if (window.innerWidth <= 860) {
      frame.style.removeProperty("--desktop-map-height");
      this.#lastMeasuredMapHeight = 0;
      return;
    }

    const stickyTop = 18;
    const bottomGap = 18;
    const frameTop = frame.getBoundingClientRect().top;
    const availableHeight = Math.max(260, Math.floor(window.innerHeight - Math.max(frameTop, stickyTop) - bottomGap));

    frame.style.setProperty("--desktop-map-height", `${availableHeight}px`);
    if (Math.abs(availableHeight - this.#lastMeasuredMapHeight) > 1) {
      this.#lastMeasuredMapHeight = availableHeight;
      requestAnimationFrame(() => this.#map?.invalidateSize());
    }
  }

  async #toggleFullscreen() {
    const frame = this.renderRoot.querySelector<HTMLElement>(".frame");
    if (!frame || typeof frame.requestFullscreen !== "function") {
      return;
    }

    try {
      if (document.fullscreenElement === frame) {
        await document.exitFullscreen();
      } else {
        await frame.requestFullscreen();
      }
    } catch (error) {
      console.error("Unable to toggle fullscreen map", error);
    }
  }

  #stopById(id?: string): MappedStop | undefined {
    return this.stops.find((stop): stop is MappedStop => stop.id === id && hasLocation(stop));
  }

  #segmentByKey(key?: string) {
    return this.segments.find((segment) => segmentKey(segment) === key);
  }

  #focusedStops() {
    if (hasText(this.focusedSegmentKey)) {
      const segment = this.#segmentByKey(this.focusedSegmentKey);
      const from = this.#stopById(segment?.mapFrom || segment?.from);
      const to = this.#stopById(segment?.mapTo || segment?.to);
      return [from, to].filter(Boolean) as MappedStop[];
    }

    if (hasText(this.focusedStopId)) {
      const index = this.stops.findIndex((stop) => stop.id === this.focusedStopId);
      if (index === -1) {
        return [];
      }

      return [this.stops[index - 1], this.stops[index], this.stops[index + 1]].filter(hasLocation);
    }

    return [];
  }

  #segmentStyle(segment: ItinerarySegment, active = false) {
    const isTrain = segment.mode === "train";
    const isFerry = segment.mode === "ferry";

    return {
      color: active ? (isTrain ? "#2f49d1" : isFerry ? "#006f96" : "#b64528") : isTrain ? "#4a5fbc" : isFerry ? "#007a8a" : "#d45c3d",
      weight: active ? (isTrain ? 7 : 8) : isTrain ? 3 : 4,
      opacity: active ? 1 : 0.88,
      dashArray: isTrain ? "8 8" : isFerry ? "2 8" : undefined,
      lineCap: "round" as const,
      lineJoin: "round" as const,
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

      const key = segmentKey(segment);
      const active = key === this.activeSegmentKey;

      if (active) {
        L.polyline([stopLatLng(from), stopLatLng(to)], {
          color: "rgba(255,255,255,0.92)",
          weight: 12,
          opacity: 0.95,
          lineCap: "round",
          lineJoin: "round",
          interactive: false,
        }).addTo(layers);
      }

      const line = L.polyline([stopLatLng(from), stopLatLng(to)], this.#segmentStyle(segment, active))
        .bindTooltip(segment.title || "")
        .on("click", () => this.#selectSegment(key))
        .on("mouseover", () => this.#hoverSegment(key))
        .on("mouseout", () => this.#hoverSegment())
        .addTo(layers);

      if (active) {
        line.openTooltip();
      }
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

    const focusedStops = this.#focusedStops();
    const viewportKey = JSON.stringify({ stop: this.focusedStopId, segment: this.focusedSegmentKey });
    if (focusedStops.length && this.#lastViewportKey !== viewportKey) {
      this.#lastViewportKey = viewportKey;
      if (focusedStops.length === 1) {
        map.setView(stopLatLng(focusedStops[0]), Math.max(map.getZoom(), 9), { animate: true });
      } else {
        map.fitBounds(L.latLngBounds(focusedStops.map(stopLatLng)), {
          padding: [48, 48],
          maxZoom: 11,
          animate: true,
        });
      }
    }

    if (!focusedStops.length) {
      this.#lastViewportKey = "";
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

  #selectSegment(key?: string) {
    this.dispatchEvent(
      new CustomEvent<SegmentEventDetail>("segment-select", {
        bubbles: true,
        composed: true,
        detail: { key },
      }),
    );
  }

  #hoverSegment(key?: string) {
    this.dispatchEvent(
      new CustomEvent<SegmentEventDetail>("segment-hover", {
        bubbles: true,
        composed: true,
        detail: { key },
      }),
    );
  }

  render() {
    const icon = this.isFullscreen ? libraryIcon(mdiFullscreenExit) : libraryIcon(mdiFullscreen);
    const label = this.isFullscreen ? "Exit fullscreen map" : "Fullscreen map";

    return html`
      <section class="frame">
        <div class="controls">
          <button class="fullscreen-toggle" type="button" aria-label=${label} title=${label} @click=${this.#toggleFullscreen}>
            ${icon}
          </button>
        </div>
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
