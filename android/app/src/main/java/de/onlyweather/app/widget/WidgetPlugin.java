package de.onlyweather.app.widget;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Die Web-App meldet hierüber den angezeigten Ort, damit das Widget denselben Ort zeigt. */
@CapacitorPlugin(name = "Widget")
public class WidgetPlugin extends Plugin {
    @PluginMethod
    public void setPlace(PluginCall call) {
        String name = call.getString("name");
        Double lat = call.getDouble("lat");
        Double lon = call.getDouble("lon");
        if (name == null || lat == null || lon == null || lat.isNaN() || lon.isNaN()) {
            call.reject("name, lat und lon sind erforderlich");
            return;
        }
        if (WidgetStore.setPlace(getContext(), name, lat, lon)) {
            WeatherWidgetProvider.requestUpdate(getContext(), true);
        }
        call.resolve();
    }
}
