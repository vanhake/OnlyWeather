import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Widget-Layouts werden vom Launcher über RemoteViews aufgebaut. Dort sind nur Klassen mit
 * @RemoteView erlaubt; schon ein einfaches <View> führt zu „Widget kann nicht geladen werden“.
 * https://developer.android.com/develop/ui/views/appwidgets/build-layouts
 */
const ALLOWED = new Set([
  'FrameLayout',
  'LinearLayout',
  'RelativeLayout',
  'GridLayout',
  'AnalogClock',
  'Button',
  'Chronometer',
  'ImageButton',
  'ImageView',
  'ProgressBar',
  'TextView',
  'TextClock',
  'ViewFlipper',
  'ListView',
  'GridView',
  'StackView',
  'AdapterViewFlipper',
]);

const dir = join(__dirname, '../android/app/src/main/res/layout');
const layouts = readdirSync(dir).filter((f) => f.startsWith('widget_') && f.endsWith('.xml'));

describe('Widget-Layouts', () => {
  it('gibt es', () => {
    expect(layouts.length).toBeGreaterThan(0);
  });

  it.each(layouts)('%s verwendet nur in RemoteViews erlaubte Views', (file) => {
    const xml = readFileSync(join(dir, file), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
    const tags = [...xml.matchAll(/<([A-Za-z][\w.]*)[\s/>]/g)].map((m) => m[1]);
    const bad = tags.filter((t) => !ALLOWED.has(t));
    expect(bad).toEqual([]);
  });
});
