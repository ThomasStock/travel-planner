import { mdiArrowRight, mdiBike, mdiFerry, mdiFlagCheckered, mdiFlagTriangle, mdiFullscreen, mdiFullscreenExit, mdiTrain } from "@mdi/js";
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
  marker?: "finish" | "start";
  day?: string;
  dateLabel?: string;
  night?: string;
  nightRange?: string;
  stay?: string;
  arrival?: string;
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
  day?: string;
  dateLabel?: string;
  date?: string;
  dateRange?: string;
  title?: string;
  duration?: string;
  distance?: string;
  routeUrl?: string;
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
const stopNightDate = (stop: ItineraryStop) => stop.nightRange || stop.night || stop.dateRange || stop.date || "";
const stopNightLabel = (stop: ItineraryStop) =>
  stop.stay || stop.arrival || (hasText(stopNightDate(stop)) ? `Night ${[stopNightDate(stop), stop.timestamp].filter(hasText).join(" · ")}` : "");
const stopLatLng = (stop: MappedStop): LatLngExpression => [stop.location.lat, stop.location.lng];
const splitRailDate = (label?: string) => {
  const [weekday = "", dateLabel = ""] = hasText(label) ? label.split(/\s+(.+)/) : [];
  return { weekday, dateLabel };
};
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

const markerIconHtml = (path: string) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"></path></svg>`;

const markerIcon = (marker?: ItineraryStop["marker"]) => {
  switch (marker) {
    case "finish":
      return libraryIcon(mdiFlagCheckered);
    case "start":
      return libraryIcon(mdiFlagTriangle);
    default:
      return nothing;
  }
};

const markerIconMarkup = (marker?: ItineraryStop["marker"]) => {
  switch (marker) {
    case "finish":
      return markerIconHtml(mdiFlagCheckered);
    case "start":
      return markerIconHtml(mdiFlagTriangle);
    default:
      return "";
  }
};

const markerTitle = (marker?: ItineraryStop["marker"]) => {
  switch (marker) {
    case "finish":
      return "Finish";
    case "start":
      return "Start";
    default:
      return "";
  }
};

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
      --mobile-map-height: clamp(240px, 32dvh, 320px);
      --shell-inline-padding: clamp(16px, 4vw, 42px);
      --page-background: radial-gradient(circle at 12% 10%, rgba(0, 108, 103, 0.14), transparent 26rem),
        radial-gradient(circle at 88% 28%, rgba(212, 92, 61, 0.1), transparent 24rem),
        linear-gradient(135deg, #fbfaf7 0%, #f1f7f4 52%, #f8f3ee 100%);
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
      width: min(1200px, 100%);
      margin: 0 auto;
      padding: 34px var(--shell-inline-padding) 56px;
      overflow: visible;
    }

    header {
      display: grid;
      gap: 12px;
      padding: 18px 0 clamp(28px, 4vw, 42px);
    }

    h1 {
      max-width: 760px;
      margin: 0;
      font-size: clamp(40px, 7vw, 80px);
      font-weight: 850;
      line-height: 0.98;
      letter-spacing: 0;
      text-wrap: balance;
    }

    .meta,
    .summary {
      width: 100%;
      max-width: 700px;
      margin: 0;
      color: #52605f;
      font-size: clamp(15px, 2vw, 18px);
      line-height: 1.6;
      overflow-wrap: anywhere;
    }

    .meta {
      color: #006c67;
      font-weight: 750;
      letter-spacing: 0.01em;
    }

    .layout {
      display: grid;
      grid-template-columns: minmax(0, 0.9fr) minmax(360px, 1.1fr);
      gap: clamp(22px, 3vw, 36px);
      align-items: start;
      min-width: 0;
    }

    .layout > * {
      min-width: 0;
    }

    trip-map {
      position: sticky;
      top: 24px;
      z-index: 8;
    }

    @media (max-width: 860px) {
      .shell {
        width: 100%;
        max-width: 100%;
        padding-top: 22px;
        padding-bottom: 42px;
      }

      header {
        padding-bottom: 22px;
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
        margin-bottom: 40px;
        border-bottom: 1px solid rgba(23, 27, 34, 0.14);
        z-index: 12;
      }

      trip-timeline {
        padding-top: 0;
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
  #autoHighlightMedia?: MediaQueryList;
  #visibleRatios = new Map<string, number>();
  #onAutoHighlightMediaChange = () => this.#observeStops();

  static styles = css`
    :host {
      display: block;
    }

    .timeline {
      position: relative;
      display: grid;
      gap: 2px;
    }
  `;

  #segmentAfter(stop: ItineraryStop, index: number): ItinerarySegment | undefined {
    const nextStop = this.stops[index + 1];
    return this.segments.find((segment) => segment.from === stop.id && segment.to === nextStop?.id) || this.segments[index];
  }

  firstUpdated() {
    if (typeof window.matchMedia === "function") {
      this.#autoHighlightMedia = window.matchMedia("(min-width: 861px)");
      this.#autoHighlightMedia.addEventListener("change", this.#onAutoHighlightMediaChange);
    }
    this.#observeStops();
  }

  updated(changedProperties: Map<string, unknown>) {
    if (changedProperties.has("stops")) {
      this.#observeStops();
    }
  }

  disconnectedCallback() {
    this.#autoHighlightMedia?.removeEventListener("change", this.#onAutoHighlightMediaChange);
    this.#autoHighlightMedia = undefined;
    this.#observer?.disconnect();
    this.#observer = undefined;
    super.disconnectedCallback();
  }

  #observeStops() {
    this.#observer?.disconnect();
    this.#visibleRatios.clear();

    const stopElements = Array.from(this.renderRoot.querySelectorAll<TripStop>("trip-stop"));
    if (!stopElements.length || typeof IntersectionObserver === "undefined" || this.#autoHighlightMedia?.matches === false) {
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
    let nightIndex = 0;

    return html`
      <section class="timeline" aria-label="Itinerary timeline">
        ${this.stops.map(
          (stop, index) => {
            const currentNightIndex = hasText(stopNightDate(stop)) ? ++nightIndex : 0;

            return html`
              <trip-stop
                data-stop-id=${stop.id}
                .stop=${stop}
                .index=${currentNightIndex}
                .selected=${this.selectedStopId === stop.id}
                .transfer=${stop.kind === "transfer" && hasText(stop.day)}
              ></trip-stop>
              ${index < this.stops.length - 1
                ? html`<trip-segment
                    .segment=${this.#segmentAfter(stop, index)}
                    .active=${segmentKey(this.#segmentAfter(stop, index)) === this.activeSegmentKey}
                  ></trip-segment>`
                : nothing}
            `;
          },
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
    transfer: { type: Boolean, reflect: true },
  };

  stop: ItineraryStop = { id: "", title: "" };
  index = 1;
  selected = false;
  transfer = false;

  static styles = css`
    :host {
      display: block;
    }

    :host([transfer]) {
      margin: -6px 0 -4px;
    }

    button {
      width: 100%;
      border: 1px solid rgba(23, 27, 34, 0.12);
      border-radius: 8px;
      display: grid;
      grid-template-columns: 64px minmax(0, 1fr);
      gap: 12px;
      align-items: start;
      padding: 14px;
      background: rgba(255, 255, 255, 0.68);
      color: inherit;
      text-align: left;
      box-shadow: 0 8px 22px rgba(23, 27, 34, 0.05);
      cursor: pointer;
    }

    button.transfer {
      grid-template-columns: 64px minmax(0, 1fr);
      gap: 26px;
      padding: 6px 0;
      background: transparent;
      border-color: transparent;
      border-radius: 0;
      box-shadow: none;
    }

    button.no-badge {
      grid-template-columns: minmax(0, 1fr);
      padding-left: 64px;
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
      font-size: 12px;
      line-height: 1;
    }

    .index svg {
      width: 18px;
      height: 18px;
      display: block;
      fill: currentColor;
    }

    .content {
      min-width: 0;
      display: grid;
      gap: 8px;
      padding-top: 1px;
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
      font-size: clamp(19px, 3vw, 24px);
      font-weight: 850;
      line-height: 1.1;
      letter-spacing: 0;
      overflow-wrap: anywhere;
    }

    button.transfer h2 {
      font-size: clamp(16px, 2.6vw, 18px);
      line-height: 1.1;
      font-weight: 700;
    }

    .transfer-day {
      align-self: center;
      justify-self: center;
      display: grid;
      gap: 3px;
      justify-items: center;
      color: rgba(82, 96, 95, 0.62);
      font-size: 10px;
      font-weight: 680;
      line-height: 1.1;
      text-align: center;
      white-space: nowrap;
    }

    .transfer-day .date-part {
      font-size: 11px;
      font-weight: 620;
      color: rgba(82, 96, 95, 0.6);
    }

    .country {
      display: inline-block;
      flex: 0 0 auto;
      font-size: 18px;
      line-height: 1;
    }

    .night {
      color: #006c67;
      font-size: 12px;
      font-weight: 760;
      line-height: 1.3;
    }

    button.transfer .night {
      color: #52605f;
      font-size: 11px;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }

    p {
      margin: 0;
      color: #52605f;
      font-size: 13px;
      line-height: 1.5;
      overflow-wrap: anywhere;
    }

    button.transfer p {
      font-size: 14px;
      line-height: 1.45;
    }

    @media (max-width: 520px) {
      button {
        grid-template-columns: 62px minmax(0, 1fr);
        gap: 10px;
        padding: 14px;
      }

      button.transfer {
        grid-template-columns: 62px minmax(0, 1fr);
        gap: 24px;
        padding: 5px 0;
      }

      button.no-badge {
        grid-template-columns: minmax(0, 1fr);
        padding-left: 60px;
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
    const nightLabel = stopNightLabel(this.stop);
    const flag = countryIcon(this.stop.countryCode);
    const countryName = hasText(this.stop.countryCode) ? countryNames[this.stop.countryCode.toUpperCase()] : undefined;
    const transfer = this.transfer;
    const transferDate = splitRailDate(this.stop.dateLabel);
    const markerLabel = markerTitle(this.stop.marker);
    const showFlag = !transfer && hasText(flag);
    const showTransferDay = transfer && hasText(this.stop.day);
    const showBadge = !transfer && (this.index > 0 || hasText(markerLabel));
    const showNight = !transfer && hasText(nightLabel);
    const showDescription = !transfer && hasText(this.stop.description);
    const buttonClass = transfer ? "transfer" : showBadge ? nothing : "no-badge";

    return html`
      <button class=${buttonClass} type="button" @click=${this.#select} @pointerenter=${this.#hover}>
        ${showTransferDay
          ? html`<span class="transfer-day">
              <span>${this.stop.day}</span>
              ${hasText(transferDate.weekday) ? html`<span class="date-part">${transferDate.weekday}</span>` : nothing}
              ${hasText(transferDate.dateLabel) ? html`<span class="date-part">${transferDate.dateLabel}</span>` : nothing}
            </span>`
          : nothing}
        ${showBadge
          ? html`<span class="index" title=${hasText(markerLabel) ? markerLabel : `Night ${this.index}`}>
              ${hasText(markerLabel) ? markerIcon(this.stop.marker) : this.index}
            </span>`
          : nothing}
        <span class="content">
          <span class="heading">
            <h2>${this.stop.title}</h2>
            ${showFlag ? html`<span class="country" title=${countryName || this.stop.countryCode}>${flag}</span>` : nothing}
          </span>
          ${showNight ? html`<span class="night">${nightLabel}</span>` : nothing}
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
      padding: 6px 0 8px;
    }

    .segment {
      width: 100%;
      border: 0;
      display: grid;
      grid-template-columns: 64px minmax(0, 1fr);
      gap: 26px;
      padding: 4px 0;
      color: #52605f;
      align-items: stretch;
      background: transparent;
      text-align: left;
      cursor: pointer;
      user-select: none;
    }

    .rail {
      position: relative;
      display: grid;
      gap: 6px;
      align-content: center;
      justify-items: center;
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
      border-left: 2px solid rgba(0, 108, 103, 0.24);
      border-image: repeating-linear-gradient(
          to bottom,
          currentColor 0,
          currentColor 9px,
          transparent 9px,
          transparent 15px
        )
        1;
      color: rgba(0, 108, 103, 0.38);
    }

    .rail::before {
      top: 0;
      bottom: calc(50% + 34px);
    }

    .rail::after {
      top: calc(50% + 34px);
      bottom: 0;
    }

    .segment.has-rail-label .rail::before {
      bottom: calc(50% + 58px);
    }

    .segment.has-rail-label .rail::after {
      top: calc(50% + 58px);
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
      display: block;
      fill: currentColor;
    }

    .rail-label {
      position: relative;
      z-index: 1;
      width: 100%;
      color: rgba(82, 96, 95, 0.62);
      font-size: 10px;
      font-weight: 680;
      line-height: 1.15;
      text-align: center;
      overflow-wrap: anywhere;
    }

    .rail-date {
      position: relative;
      z-index: 1;
      display: grid;
      gap: 2px;
      justify-items: center;
      color: rgba(82, 96, 95, 0.6);
      font-size: 10px;
      font-weight: 620;
      line-height: 1.1;
      text-align: center;
      white-space: nowrap;
    }

    .rail-date span {
      display: block;
    }

    .content {
      display: grid;
      gap: 8px;
      min-width: 0;
      padding: 18px 0 22px;
    }

    .segment-head {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 12px;
      align-items: start;
    }

    .title {
      color: #283330;
      font-size: 14px;
      font-weight: 800;
      line-height: 1.35;
      overflow-wrap: anywhere;
    }

    .distance {
      color: #171b22;
      font-size: 13px;
      font-weight: 850;
      line-height: 1.25;
      justify-self: end;
      text-align: right;
      white-space: nowrap;
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
      line-height: 1.55;
      overflow-wrap: anywhere;
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      padding-top: 2px;
    }

    .route-link {
      width: fit-content;
      border: 1px solid rgba(0, 108, 103, 0.2);
      border-radius: 999px;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 3px 8px 3px 5px;
      background: rgba(255, 255, 255, 0.58);
      color: #006c67;
      font-size: 11px;
      font-weight: 800;
      line-height: 1;
      text-decoration: none;
    }

    .komoot-icon {
      width: 15px;
      height: 15px;
      border-radius: 50%;
      display: inline-grid;
      place-items: center;
      background: #7bbf32;
      color: #fff;
      font-size: 11px;
      font-weight: 900;
      line-height: 1;
    }

    @media (max-width: 520px) {
      :host {
        padding: 5px 0 7px;
      }

      .segment {
        grid-template-columns: 62px minmax(0, 1fr);
        gap: 24px;
        padding: 4px 0;
      }

      .rail::before {
        bottom: calc(50% + 30px);
      }

      .rail::after {
        top: calc(50% + 30px);
      }

      .segment.has-rail-label .rail::before {
        bottom: calc(50% + 52px);
      }

      .segment.has-rail-label .rail::after {
        top: calc(50% + 52px);
      }

      .content {
        padding: 16px 0 18px;
      }

      .segment-head {
        grid-template-columns: minmax(0, 1fr);
        gap: 4px;
      }

      .distance {
        justify-self: start;
        text-align: left;
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

  #keydown(event: KeyboardEvent) {
    const target = event.target as Element | null;
    if (target?.closest("a")) {
      return;
    }

    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    this.#select();
  }

  render() {
    const segment = this.segment || {};
    const railDate = splitRailDate(segment.dateLabel);
    const facts = [segment.duration].filter(hasText);
    const icon = modeIcon(segment.mode);
    const distance = hasText(segment.distance) ? segment.distance : "";
    const routeUrl = hasText(segment.routeUrl) ? segment.routeUrl : "";

    if (!hasText(segment.title) && !hasText(segment.description) && !hasText(segment.day) && facts.length === 0 && !hasText(distance) && !hasText(routeUrl)) {
      return nothing;
    }

    return html`
      <article
        class=${hasText(segment.day) || hasText(segment.dateLabel) ? "segment has-rail-label" : "segment"}
        role="button"
        tabindex="0"
        @click=${this.#select}
        @keydown=${this.#keydown}
        @pointerenter=${this.#hover}
        @pointerleave=${this.#leave}
      >
        <span class="rail">
          ${hasText(segment.day) ? html`<span class="rail-label">${segment.day}</span>` : nothing}
          <span class="mode" title=${hasText(segment.mode) ? segment.mode : "travel"}>${icon}</span>
          ${hasText(railDate.weekday) || hasText(railDate.dateLabel)
            ? html`<span class="rail-date">
                ${hasText(railDate.weekday) ? html`<span>${railDate.weekday}</span>` : nothing}
                ${hasText(railDate.dateLabel) ? html`<span>${railDate.dateLabel}</span>` : nothing}
              </span>`
            : nothing}
        </span>
        <span class="content">
          ${hasText(segment.title) || hasText(distance)
            ? html`<span class="segment-head">
                ${hasText(segment.title) ? html`<span class="title">${segment.title}</span>` : html`<span></span>`}
                ${hasText(distance) ? html`<span class="distance">${distance}</span>` : nothing}
              </span>`
            : nothing}
          ${facts.length ? html`<span class="facts">${facts.map((fact) => html`<span>${fact}</span>`)}</span>` : nothing}
          ${hasText(segment.description) ? html`<p>${segment.description}</p>` : nothing}
          ${hasText(routeUrl)
            ? html`<span class="actions">
                <a class="route-link" href=${routeUrl} target="_blank" rel="noopener noreferrer" @click=${(event: Event) => event.stopPropagation()}>
                  <span class="komoot-icon" aria-hidden="true">k</span>
                  <span>Open in komoot</span>
                </a>
              </span>`
            : nothing}
        </span>
      </article>
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
  #usingFallbackFullscreen = false;
  #onFullscreenChange = () => {
    const frame = this.renderRoot.querySelector<HTMLElement>(".frame");
    const isNativeFullscreen = document.fullscreenElement === frame;
    this.#usingFallbackFullscreen = this.#usingFallbackFullscreen && !isNativeFullscreen;
    this.isFullscreen = isNativeFullscreen || this.#usingFallbackFullscreen;
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

      .frame.is-fullscreen {
        position: fixed;
        inset: 0;
        z-index: 4000;
        background: #d9eeed;
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
        box-shadow: 0 22px 48px rgba(23, 27, 34, 0.14);
      }

      .frame:fullscreen .map {
        height: 100dvh;
        min-height: 100dvh;
        max-height: 100dvh;
        border: 0;
        border-radius: 0;
        box-shadow: none;
      }

      .frame.is-fullscreen .map {
        height: 100dvh;
        min-height: 100dvh;
        max-height: 100dvh;
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

      .map-stop-marker.empty {
        width: 16px;
        height: 16px;
        font-size: 0;
      }

      .map-stop-marker svg {
        width: 14px;
        height: 14px;
        display: block;
        fill: currentColor;
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
    this.#setFallbackFullscreen(false);
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

  #setFallbackFullscreen(nextValue: boolean) {
    this.#usingFallbackFullscreen = nextValue;
    document.documentElement.style.overflow = nextValue ? "hidden" : "";
    document.body.style.overflow = nextValue ? "hidden" : "";

    const frame = this.renderRoot.querySelector<HTMLElement>(".frame");
    this.isFullscreen = nextValue || document.fullscreenElement === frame;
    requestAnimationFrame(() => {
      this.#syncDesktopMapHeight();
      this.#map?.invalidateSize();
    });
  }

  async #toggleFullscreen() {
    const frame = this.renderRoot.querySelector<HTMLElement>(".frame");
    if (!frame) {
      return;
    }

    if (this.#usingFallbackFullscreen) {
      this.#setFallbackFullscreen(false);
      return;
    }

    try {
      if (document.fullscreenElement === frame) {
        await document.exitFullscreen();
        return;
      }

      if (typeof frame.requestFullscreen === "function") {
        await frame.requestFullscreen();
        return;
      }
    } catch (error) {
      console.error("Unable to toggle fullscreen map", error);
    }

    this.#setFallbackFullscreen(true);
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
      stops: mappedStops.map((stop) => [stop.id, stop.marker, stopNightDate(stop), stop.location.lat, stop.location.lng]),
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

    let nightIndex = 0;

    mappedStops.forEach((stop) => {
      const selected = stop.id === this.selectedStopId;
      const currentNightIndex = hasText(stopNightDate(stop)) ? ++nightIndex : 0;
      const markerLabel = markerTitle(stop.marker);
      const label = markerIconMarkup(stop.marker) || (currentNightIndex ? String(currentNightIndex) : "");
      const labelClass = label ? "" : " empty";
      const tooltipPrefix = markerLabel || (currentNightIndex ? `Night ${currentNightIndex}` : "Stop");
      const marker = L.marker(stopLatLng(stop), {
        icon: L.divIcon({
          className: "",
          html: `<span class="map-stop-marker${selected ? " selected" : ""}${labelClass}">${label}</span>`,
          iconAnchor: [13, 13],
        }),
      });

      marker
        .bindTooltip(`${tooltipPrefix}. ${stop.title}`, {
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
      <section class=${this.isFullscreen ? "frame is-fullscreen" : "frame"}>
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
