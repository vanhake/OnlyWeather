import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'de.onlyweather.app',
  appName: 'OnlyWeather',
  webDir: 'dist',
  // Eindeutige Kennung gegenüber den Kartenkachel- und Datenservern (OSM-Tile-Policy).
  appendUserAgent: 'OnlyWeather/0.1 (+https://github.com/vanhake/OnlyWeather)',
  plugins: {
    // fetch() läuft in der App über den nativen HTTP-Stack: kein CORS, daher braucht die
    // APK den /dwd-Proxy nicht und fragt maps.dwd.de direkt ab.
    CapacitorHttp: { enabled: true },
  },
};

export default config;
