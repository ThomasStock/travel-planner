import { LitElement, css, html, nothing, svg } from 'lit';

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

interface ItineraryLeg {
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
  legs: ItineraryLeg[];
}

interface MapPoint {
  id: string;
  title: string;
  index: number;
  x: number;
  y: number;
}

type MappedStop = ItineraryStop & { location: StopLocation };

const emptyItinerary = (): ItineraryData => ({ stops: [], legs: [] });

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
      max-width: 720px;
      margin: 0;
      color: #52605f;
      font-size: clamp(15px, 2vw, 18px);
      line-height: 1.6;
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
    }

    trip-map {
      position: sticky;
      top: 18px;
    }

    @media (max-width: 860px) {
      .shell {
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
      const parsed = JSON.parse(source.textContent) as Partial<ItineraryData>;
      return {
        ...parsed,
        stops: Array.isArray(parsed.stops) ? parsed.stops : [],
        legs: Array.isArray(parsed.legs) ? parsed.legs : [],
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
    const { title, summary, dates, stops = [], legs = [] } = this.data || {};

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
            .legs=${legs}
            .selectedStopId=${this.selectedStopId}
          ></trip-timeline>
          <trip-map
            .stops=${stops}
            .legs=${legs}
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
    legs: { attribute: false },
    selectedStopId: { attribute: false },
  };

  stops: ItineraryStop[] = [];
  legs: ItineraryLeg[] = [];
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

  #legAfter(stop: ItineraryStop, index: number): ItineraryLeg | undefined {
    const nextStop = this.stops[index + 1];
    return this.legs.find((leg) => leg.from === stop.id && leg.to === nextStop?.id) || this.legs[index];
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
            ? html`<trip-leg .leg=${this.#legAfter(stop, index)}></trip-leg>`
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

class TripLeg extends LitElement {
  static properties = {
    leg: { attribute: false },
  };

  leg?: ItineraryLeg;

  static styles = css`
    :host {
      display: block;
      padding: 0 0 0 38px;
    }

    .leg {
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

      .leg {
        grid-template-columns: 28px minmax(0, 1fr);
        padding-left: 16px;
      }
    }
  `;

  render() {
    const leg = this.leg || {};
    const facts = [leg.duration, leg.distance].filter(hasText);
    const icon = modeIcons[leg.mode] || '>';

    if (!hasText(leg.title) && !hasText(leg.description) && facts.length === 0) {
      return nothing;
    }

    return html`
      <div class="leg">
        <span class="mode" aria-hidden="true">${icon}</span>
        <span class="content">
          ${hasText(leg.title) ? html`<span class="title">${leg.title}</span>` : nothing}
          ${facts.length ? html`<span class="facts">${facts.map((fact) => html`<span>${fact}</span>`)}</span>` : nothing}
          ${hasText(leg.description) ? html`<p>${leg.description}</p>` : nothing}
        </span>
      </div>
    `;
  }
}

class TripMap extends LitElement {
  static properties = {
    stops: { attribute: false },
    legs: { attribute: false },
    selectedStopId: { attribute: false },
  };

  stops: ItineraryStop[] = [];
  legs: ItineraryLeg[] = [];
  selectedStopId = '';

  static styles = css`
    :host {
      display: block;
    }

    .map {
      min-height: 420px;
      border: 1px solid rgba(23, 27, 34, 0.12);
      border-radius: 8px;
      overflow: hidden;
      background:
        linear-gradient(135deg, rgba(0, 108, 103, 0.11), rgba(246, 191, 73, 0.16)),
        #eef5f3;
      box-shadow: 0 18px 42px rgba(23, 27, 34, 0.12);
    }

    svg {
      display: block;
      width: 100%;
      min-height: 420px;
      height: clamp(420px, 58vw, 640px);
    }

    .water {
      fill: #d9eeed;
    }

    .land {
      fill: rgba(255, 255, 255, 0.74);
      stroke: rgba(0, 108, 103, 0.25);
      stroke-width: 2;
    }

    .route {
      fill: none;
      stroke: #d45c3d;
      stroke-width: 5;
      stroke-linecap: round;
      stroke-linejoin: round;
      stroke-dasharray: 1 12;
    }

    .stop {
      cursor: pointer;
      outline: none;
    }

    .pin {
      fill: #fff;
      stroke: #006c67;
      stroke-width: 4;
      transition: fill 150ms ease, stroke 150ms ease, transform 150ms ease;
      transform-box: fill-box;
      transform-origin: center;
    }

    .stop:hover .pin,
    .stop:focus-visible .pin,
    .stop[selected] .pin {
      fill: #d45c3d;
      stroke: #171b22;
      transform: scale(1.15);
    }

    .num {
      fill: #171b22;
      font-size: 22px;
      font-weight: 850;
      text-anchor: middle;
      dominant-baseline: central;
      pointer-events: none;
    }

    .label-bg {
      fill: rgba(255, 255, 255, 0.88);
      stroke: rgba(23, 27, 34, 0.12);
    }

    .label {
      fill: #171b22;
      font-size: 20px;
      font-weight: 760;
      pointer-events: none;
    }

    @media (max-width: 520px) {
      .map {
        min-height: 340px;
      }

      svg {
        min-height: 340px;
        height: 360px;
      }

      .label {
        font-size: 24px;
      }
    }
  `;

  #points(): MapPoint[] {
    const stops = this.stops.filter(hasLocation);
    if (!stops.length) {
      return [];
    }

    const lats = stops.map((stop) => stop.location.lat);
    const lngs = stops.map((stop) => stop.location.lng);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const latSpan = maxLat - minLat || 1;
    const lngSpan = maxLng - minLng || 1;
    const pad = 110;
    const width = 1000 - pad * 2;
    const height = 640 - pad * 2;

    return stops.map((stop, index) => ({
      id: stop.id,
      title: stop.title,
      index: index + 1,
      x: pad + ((stop.location.lng - minLng) / lngSpan) * width,
      y: pad + (1 - ((stop.location.lat - minLat) / latSpan)) * height,
    }));
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
    const points = this.#points();
    const route = points.map((point) => `${point.x},${point.y}`).join(' ');

    return html`
      <section class="map" aria-label="Itinerary map">
        <svg viewBox="0 0 1000 640" role="img" aria-label="Map with clickable itinerary stops">
          <rect class="water" width="1000" height="640" rx="0"></rect>
          <path class="land" d="M97 515 C142 430 116 345 186 269 C241 209 244 131 329 89 C421 43 515 96 575 52 C640 6 740 38 785 103 C833 172 799 239 868 300 C943 366 927 475 847 528 C774 576 711 548 623 582 C539 614 438 596 363 552 C279 503 169 588 97 515 Z"></path>
          <path class="land" d="M628 244 C677 198 747 203 782 259 C824 326 784 403 715 414 C654 423 599 369 604 309 C606 282 614 259 628 244 Z"></path>
          ${route ? svg`<polyline class="route" points=${route}></polyline>` : nothing}
          ${points.map((point) => {
            const selected = this.selectedStopId === point.id;
            const labelWidth = Math.max(112, point.title.length * 10 + 34);
            const labelX = Math.min(point.x + 26, 962 - labelWidth);
            const labelY = Math.max(28, point.y - 48);

            return svg`
              <g
                class="stop"
                tabindex="0"
                role="button"
                aria-label=${point.title}
                ?selected=${selected}
                @click=${() => this.#select(point.id)}
                @pointerenter=${() => this.#hover(point.id)}
                @keydown=${(event: KeyboardEvent) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    this.#select(point.id);
                  }
                }}
              >
                <rect class="label-bg" x=${labelX} y=${labelY} width=${labelWidth} height="34" rx="6"></rect>
                <text class="label" x=${labelX + 16} y=${labelY + 23}>${point.title}</text>
                <circle class="pin" cx=${point.x} cy=${point.y} r="23"></circle>
                <text class="num" x=${point.x} y=${point.y + 1}>${point.index}</text>
              </g>
            `;
          })}
        </svg>
      </section>
    `;
  }
}

customElements.define('travel-itinerary', TravelItinerary);
customElements.define('trip-timeline', TripTimeline);
customElements.define('trip-stop', TripStop);
customElements.define('trip-leg', TripLeg);
customElements.define('trip-map', TripMap);
