import { describe, expect, it } from 'vitest';
import { findLayer, parseCapabilities } from '../src/dwd/capabilities';
import { planRadarFrames } from '../src/dwd/radar-frames';

// Synthetisches Dokument im Aufbau eines GeoServer-WMS-1.3.0-GetCapabilities (gekürzt).
function caps(layers: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<WMS_Capabilities version="1.3.0" xmlns="http://www.opengis.net/wms" xmlns:xlink="http://www.w3.org/1999/xlink">
  <Capability><Layer><Title>DWD</Title>${layers}</Layer></Capability>
</WMS_Capabilities>`;
}

const layer = (name: string, time?: string, def = 'current') => `
  <Layer queryable="1">
    <Name>${name}</Name><Title>${name} Titel</Title>
    ${time ? `<Dimension name="time" default="${def}" units="ISO8601">${time}</Dimension>` : ''}
    <Style><Name>s</Name><LegendURL><Format>image/png</Format>
      <OnlineResource xlink:type="simple" xlink:href="https://maps.dwd.de/legend/${name}"/></LegendURL></Style>
  </Layer>`;

const NOW = Date.parse('2026-10-26T12:02:00Z');

describe('parseCapabilities', () => {
  it('liest Name, Titel, Zeitdimension und Legende', () => {
    const layers = parseCapabilities(caps(layer('Niederschlagsradar', '2026-10-26T10:00:00Z/2026-10-26T14:00:00Z/PT5M')));
    expect(layers).toHaveLength(1);
    expect(layers[0]).toMatchObject({
      name: 'Niederschlagsradar',
      title: 'Niederschlagsradar Titel',
      time: '2026-10-26T10:00:00Z/2026-10-26T14:00:00Z/PT5M',
      timeDefault: 'current',
      legendUrl: 'https://maps.dwd.de/legend/Niederschlagsradar',
    });
    // Kandidaten mit und ohne "dwd:"-Präfix finden denselben Layer.
    expect(findLayer(layers, ['dwd:Niederschlagsradar'])?.name).toBe('Niederschlagsradar');
  });

  it('meldet ServiceExceptions als Fehler', () => {
    expect(() => parseCapabilities('<ServiceExceptionReport><ServiceException>kaputt</ServiceException></ServiceExceptionReport>')).toThrow(
      /kaputt/,
    );
  });
});

describe('planRadarFrames', () => {
  it('nutzt einen Layer mit Beobachtung und Nowcast nahtlos', () => {
    const layers = parseCapabilities(
      caps(layer('dwd:Niederschlagsradar', '2026-10-23T12:00:00Z/2026-10-26T14:00:00Z/PT5M')),
    );
    const plan = planRadarFrames(layers, NOW);
    expect(new Date(plan.boundary).toISOString()).toBe('2026-10-26T12:00:00.000Z');
    const past = plan.frames.filter((f) => !f.forecast);
    const future = plan.frames.filter((f) => f.forecast);
    expect(past).toHaveLength(25); // 10:00 … 12:00
    expect(future).toHaveLength(24); // 12:05 … 14:00
    expect(new Date(future.at(-1)!.time).toISOString()).toBe('2026-10-26T14:00:00.000Z');
  });

  it('kombiniert getrennte Beobachtungs- und Nowcast-Layer', () => {
    const layers = parseCapabilities(
      caps(
        layer('dwd:Niederschlagsradar', '2026-10-26T08:00:00Z/2026-10-26T11:55:00Z/PT5M') +
          layer('dwd:Radar_rv_product_1x1km_ger', '2026-10-26T12:00:00Z/2026-10-26T13:55:00Z/PT5M'),
      ),
    );
    const plan = planRadarFrames(layers, NOW);
    expect(plan.observedLayer.name).toBe('dwd:Niederschlagsradar');
    expect(plan.nowcastLayer?.name).toBe('dwd:Radar_rv_product_1x1km_ger');
    expect(plan.frames.find((f) => f.forecast)?.layer).toBe('dwd:Radar_rv_product_1x1km_ger');
    expect(plan.frames.filter((f) => !f.forecast)).toHaveLength(25);
  });

  it('wirft einen verständlichen Fehler ohne Radar-Layer', () => {
    const layers = parseCapabilities(caps(layer('dwd:Warnungen_Gemeinden')));
    expect(() => planRadarFrames(layers, NOW)).toThrow(/keine Radar-Ebene/);
  });
});
